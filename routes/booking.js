const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

module.exports = function(app) {
    const bookingsFile = path.join(__dirname, '..', 'database', 'bookings.json');
    
    // Rate limiting storage (in production, use Redis)
    const rateLimitStore = new Map();
    
    // Rate limiting middleware
    function rateLimit(maxRequests = 5, windowMs = 15 * 60 * 1000) {
        return (req, res, next) => {
            const clientIP = req.ip || req.connection.remoteAddress;
            const now = Date.now();
            const windowStart = now - windowMs;
            
            if (!rateLimitStore.has(clientIP)) {
                rateLimitStore.set(clientIP, []);
            }
            
            const requests = rateLimitStore.get(clientIP);
            // Remove old requests outside the window
            const recentRequests = requests.filter(time => time > windowStart);
            
            if (recentRequests.length >= maxRequests) {
                return res.status(429).json({
                    success: false,
                    message: 'Too many booking attempts. Please try again later.'
                });
            }
            
            recentRequests.push(now);
            rateLimitStore.set(clientIP, recentRequests);
            next();
        };
    }

    // Input sanitization
    function sanitizeInput(input) {
        if (typeof input !== 'string') return input;
        return input.trim().replace(/[<>]/g, '');
    }

    // Generate secure booking ID
    function generateBookingId() {
        return crypto.randomBytes(8).toString('hex').toUpperCase();
    }

    // Initialize bookings file if it doesn't exist
    async function initBookingsFile() {
        try {
            await fs.access(bookingsFile);
        } catch {
            await fs.writeFile(bookingsFile, JSON.stringify([], null, 2));
        }
    }

    initBookingsFile();

    // Submit booking with rate limiting
    app.post('/api/bookings', rateLimit(3, 10 * 60 * 1000), async (req, res) => {
        try {
            let { bookerName, bookerContact, checkIn, checkOut, guests, roomPrice } = req.body;

            // Sanitize inputs
            bookerName = sanitizeInput(bookerName);
            bookerContact = sanitizeInput(bookerContact);

            // Enhanced validation
            if (!bookerName || !bookerContact || !checkIn || !checkOut || !guests || !roomPrice) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'All fields are required' 
                });
            }

            // Validate name (letters, spaces, hyphens, apostrophes only)
            if (!/^[a-zA-Z\s\-']{2,50}$/.test(bookerName)) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Name must contain only letters, spaces, hyphens, and apostrophes (2-50 characters)' 
                });
            }

            // Enhanced contact validation
            const isEmail = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(bookerContact);
            const isPhone = /^[\+]?[0-9\s\-\(\)]{10,15}$/.test(bookerContact);
            if (!isEmail && !isPhone) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Please provide a valid email address or phone number' 
                });
            }

            // Enhanced date validation
            const inDate = new Date(checkIn);
            const outDate = new Date(checkOut);
            const today = new Date();
            const maxFutureDate = new Date();
            maxFutureDate.setFullYear(today.getFullYear() + 2); // Max 2 years in future
            
            today.setHours(0, 0, 0, 0);

            if (isNaN(inDate.getTime()) || isNaN(outDate.getTime())) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Invalid date format' 
                });
            }

            if (inDate < today) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Check-in date cannot be in the past' 
                });
            }

            if (inDate > maxFutureDate) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Check-in date cannot be more than 2 years in the future' 
                });
            }

            if (outDate <= inDate) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Check-out date must be after check-in date' 
                });
            }

            // Validate maximum stay duration (e.g., 30 days)
            const maxStayDays = 30;
            const stayDuration = (outDate - inDate) / (1000 * 60 * 60 * 24);
            if (stayDuration > maxStayDays) {
                return res.status(400).json({ 
                    success: false, 
                    message: `Maximum stay duration is ${maxStayDays} days` 
                });
            }

            // Validate guests
            const guestCount = parseInt(guests);
            if (isNaN(guestCount) || guestCount < 1 || guestCount > 10) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Number of guests must be between 1 and 10' 
                });
            }

            // Enhanced room price validation - allow any reasonable price
            const price = parseFloat(roomPrice);
            const minPrice = 500;  // Minimum ₦500 per night
            const maxPrice = 100000; // Maximum ₦100,000 per night
            
            if (isNaN(price) || price < minPrice || price > maxPrice) {
                return res.status(400).json({ 
                    success: false, 
                    message: `Room price must be between ₦${minPrice.toLocaleString()} and ₦${maxPrice.toLocaleString()}` 
                });
            }

            // Calculate nights and total
            const nights = Math.ceil((outDate - inDate) / (1000 * 60 * 60 * 24));
            const totalPrice = nights * price;

            // Check for duplicate bookings (same contact within 5 minutes)
            const data = await fs.readFile(bookingsFile, 'utf8');
            const existingBookings = JSON.parse(data);
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            
            const recentDuplicate = existingBookings.find(booking => 
                booking.bookerContact === bookerContact && 
                new Date(booking.createdAt) > fiveMinutesAgo
            );

            if (recentDuplicate) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'A booking with this contact was recently submitted. Please wait before submitting another.' 
                });
            }

            // Create booking object with secure ID
            const booking = {
                id: generateBookingId(),
                bookerName: bookerName.trim(),
                bookerContact: bookerContact.trim(),
                checkIn,
                checkOut,
                guests: guestCount,
                roomPrice: price,
                nights,
                totalPrice,
                status: 'pending',
                paymentStatus: 'pending',
                paymentMethod: null,
                paymentReference: null,
                clientIP: req.ip || req.connection.remoteAddress,
                userAgent: req.get('User-Agent') || 'Unknown',
                createdAt: new Date().toISOString()
            };

            // Add new booking
            existingBookings.push(booking);

            // Save to file with atomic write
            const tempFile = bookingsFile + '.tmp';
            await fs.writeFile(tempFile, JSON.stringify(existingBookings, null, 2));
            await fs.rename(tempFile, bookingsFile);

            // Return response without sensitive data
            res.json({ 
                success: true, 
                message: 'Booking submitted successfully',
                bookingId: booking.id,
                totalPrice: booking.totalPrice,
                nights: booking.nights
            });

        } catch (error) {
            console.error('Booking error:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Server error. Please try again later.' 
            });
        }
    });

    // Authentication middleware for admin endpoints
    function requireAuth(req, res, next) {
        // Check if user is authenticated (you should implement proper session/JWT auth)
        if (!req.session || !req.session.isAuthenticated) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }
        next();
    }

    // Get all bookings (admin only)
    app.get('/api/bookings', requireAuth, async (req, res) => {
        try {
            const data = await fs.readFile(bookingsFile, 'utf8');
            const bookings = JSON.parse(data);
            
            // Remove sensitive data from response
            const sanitizedBookings = bookings.map(booking => ({
                ...booking,
                clientIP: undefined,
                userAgent: undefined
            }));
            
            res.json({ success: true, bookings: sanitizedBookings });
        } catch (error) {
            console.error('Error fetching bookings:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Error fetching bookings' 
            });
        }
    });

    // Update booking status (admin only)
    app.patch('/api/bookings/:id', requireAuth, async (req, res) => {
        try {
            const { id } = req.params;
            const { status } = req.body;

            // Validate booking ID format
            if (!/^[A-F0-9]{16}$/.test(id)) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Invalid booking ID format' 
                });
            }

            if (!['pending', 'confirmed', 'cancelled'].includes(status)) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Invalid status. Must be: pending, confirmed, or cancelled' 
                });
            }

            const data = await fs.readFile(bookingsFile, 'utf8');
            const bookings = JSON.parse(data);

            const bookingIndex = bookings.findIndex(b => b.id === id);
            if (bookingIndex === -1) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'Booking not found' 
                });
            }

            bookings[bookingIndex].status = status;
            bookings[bookingIndex].updatedAt = new Date().toISOString();
            bookings[bookingIndex].updatedBy = req.session.userId || 'admin';

            // Atomic write
            const tempFile = bookingsFile + '.tmp';
            await fs.writeFile(tempFile, JSON.stringify(bookings, null, 2));
            await fs.rename(tempFile, bookingsFile);

            // Remove sensitive data from response
            const sanitizedBooking = {
                ...bookings[bookingIndex],
                clientIP: undefined,
                userAgent: undefined
            };

            res.json({ 
                success: true, 
                message: 'Booking updated successfully',
                booking: sanitizedBooking
            });

        } catch (error) {
            console.error('Error updating booking:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Error updating booking' 
            });
        }
    });
};
