    //load
    const body = document.getElementById('body');
    const load = document.querySelector('.load');
    
    window.addEventListener('load', () => {
        setTimeout(() => {
            body.style.display = 'block';
            body.classList.add('loaded');
            load.style.display = 'none';
        }, 3000);
        
        // Track page view
        trackPageView();
    });

    // Track page view function
    async function trackPageView() {
        try {
            const response = await fetch('/api/views');
            const data = await response.json();
            
            if (data.success) {
                console.log(`Total views: ${data.views}, Unique visitors: ${data.uniqueVisitors}`);
            }
        } catch (error) {
            console.error('Error tracking page view:', error);
        }
    }

    //nav
    const nav2 = document.getElementById("nav2");
    const hamburger = document.getElementById("hamburger");
    const bg = document.querySelector('.bgf');
    const navX = document.getElementById('navX');

    navX.addEventListener('click', () => {
        nav2.classList.remove('active');
        hamburger.classList.remove('active');
        bg.style.display = 'none'
    });

    hamburger.addEventListener('click', (e) => {
        e.stopPropagation();
        nav2.classList.toggle('active');
        hamburger.classList.toggle('active');
        bg.style.display = nav2.classList.contains('active') ? 'flex' : 'none';
    });

    //property upload here
    const cardsContainer = document.getElementById('cardsContainer');
    const grid = cardsContainer;

    const BATCH   = 8;   // cards added/removed at a time
    const MAX_DOM = 50;  // max cards in the DOM at once

    let allPosts  = [];  // full pool fetched from server
    let cursor    = 0;   // index into allPosts for next batch
    let isLoading = false;

    // sentinel — triggers next batch when user reaches the bottom
    const sentinel = document.createElement('div');
    sentinel.id = 'scroll-sentinel';
    sentinel.style.cssText = 'height:40px;display:flex;align-items:center;justify-content:center;color:#aaa;font-size:13px;';
    grid.after(sentinel);

    function shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    // get next 8 posts from the pool, looping and shuffling when exhausted
    function nextBatch() {
        const batch = [];
        for (let i = 0; i < BATCH; i++) {
            // when we reach the end, shuffle the pool and restart
            if (cursor >= allPosts.length) {
                shuffle(allPosts);
                cursor = 0;
            }
            batch.push(allPosts[cursor++]);
        }
        return batch;
    }

    function addBatch() {
        if (isLoading || !allPosts.length) return;
        isLoading = true;

        sentinel.innerHTML = '<i class="fas fa-spinner fa-spin"></i>&nbsp; Loading...';

        // defer DOM work to next animation frame — keeps scroll smooth
        requestAnimationFrame(() => {
            const batch = nextBatch();

            // single DOM write for all 8 cards
            grid.insertAdjacentHTML('beforeend', batch.map(p => propertyCard(p)).join(''));

            // remove oldest from top using live HTMLCollection — no querySelectorAll
            while (grid.children.length > MAX_DOM + 1) { // +1 for sentinel
                grid.firstElementChild.remove();
            }

            sentinel.innerHTML = '';
            isLoading = false;
        });
    }

    async function uploadProperty() {
        // show skeletons while fetching
        grid.innerHTML = Array(8).fill(`
            <div class="skeleton-card">
                <div class="skeleton skeleton-img"></div>
                <div class="skeleton-body">
                    <div class="skeleton skeleton-line" style="width:60%"></div>
                    <div class="skeleton skeleton-line" style="width:40%"></div>
                    <div class="skeleton skeleton-line" style="width:80%"></div>
                </div>
            </div>
        `).join('');

        try {
            const res  = await fetch('/api/post/property');
            const data = await res.json();

            grid.innerHTML = '';

            if (data.success && data.property.length) {
                allPosts = data.property;
                cursor   = 0;

                // render first 50 cards (or all if less than 50)
                const initial = allPosts.slice(0, MAX_DOM);
                cursor = initial.length;
                initial.forEach(p => grid.insertAdjacentHTML('beforeend', propertyCard(p)));
                window.dispatchEvent(new Event('scroll'));
            } else {
                grid.innerHTML = '<p style="text-align:center;padding:40px;color:#888;">No properties listed yet.</p>';
            }

        } catch (err) {
            console.error(err);
            grid.innerHTML = '<p style="text-align:center;padding:40px;color:#888;">Network error. Please refresh.</p>';
        }
    }

    // observer fires when sentinel enters viewport
    const scrollObserver = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) addBatch();
    }, { threshold: 0.1 });

    scrollObserver.observe(sentinel);

    // initial fetch
    uploadProperty();

    // re-fetch every 1 min to pick up new/boosted posts
    setInterval(async () => {
        try {
            const res  = await fetch('/api/post/property');
            const data = await res.json();
            if (data.success && data.property.length) {
                allPosts = data.property;
                cursor   = 0;
            }
        } catch (err) { /* silent */ }
    },  60 * 1000);

        // set the card function up 
        function propertyCard(p) {
        const imgSrc   = p.imageNames && p.imageNames.length
            ? `/agent-loged/upload-property/${p.imageNames[0]}`
            : 'profile.png';
        const imgCount = p.imageNames ? p.imageNames.length : 0;
        const price = Number(p.price).toLocaleString();
        const date = new Date(p.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        const isLand = (p.type || '').toLowerCase() === 'land';

        return `
            <div class="listing-card section" data-title="${p.title}, ${p.type || 'Property'}" data-location="${p.location || 'N/A'}" data-price="${p.price}" data-room="${p.beds || 0} , ${p.baths || 0}">
                <div class="card-image">
                    <img src="${imgSrc}" alt="${p.type || 'Property'}" loading="lazy">
                    <span class="card-type-badge">${p.type || 'Property'}${p.title ? ', ' + p.title : ''}</span>
                    ${p.category ? `<span class="card-category-badge ${p.category}">${p.category === 'shortlet' ? 'Short-let' : p.category === 'rent' ? 'For Rent' : 'For Sale'}</span>` : ''}
                    ${imgCount > 1 ? `<span class="card-image-count"><i class="fas fa-images"></i> ${imgCount}</span>` : ''}
                </div>
                <div class="card-body">
                    <div class="card-price">₦${price}</div>
                    <div class="card-location"><i class="fas fa-map-marker-alt"></i> ${p.location || 'N/A'}</div>
                    <div class="card-stats">
                        ${isLand ? '' : `<span class="card-stat"><i class="fas fa-bed"></i> ${p.beds || 0} Beds</span>`}
                        ${isLand ? '' : `<span class="card-stat"><i class="fas fa-bath"></i> ${p.baths || 0} Baths</span>`}
                        ${isLand? `<span class="card-stat"><i class="fas fa-ruler-combined"></i> ${p.area || 0}</span>` : ''}
                    </div>
                    <div class="card-date"><i class="fas fa-calendar-alt"></i> Listed ${date} <i class="fas fa-eye"></i> views ${p.view || 0}</div>
                </div>
                <div class="card-footer">
                    <a href="/property?id=${p._id}" class="btn-view-details">
                        View Details <i class="fas fa-arrow-right"></i>
                    </a>
                    <button class="btn-share-card" onclick="shareCard('${p._id}')">
                        <i class="fas fa-share-alt"></i>
                    </button>
                </div>
            </div>
        `;
    }

    //share link
    window.shareCard = function(id) {
        const url = `${window.location.origin}/property?id=${id}`;
        if (navigator.share) {
            navigator.share({ title: 'Check out this property on Easy Find', url })
                .catch(() => copyLink(url));
        } else {
            copyLink(url);
        }
    };
    //copy link
    function copyLink(url) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url)
                .then(() => alertBox.success('Copied', 'Property link copied to clipboard'))
                .catch(() => fallbackCopy(url));
        } else {
            fallbackCopy(url);
        }
    }

    function fallbackCopy(url) {
        const el = document.createElement('textarea');
        el.value = url;
        el.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        alertBox.success('Copied', 'Property link copied to clipboard');
    }

    //type of search
    const propertyBtn = document.querySelector('.property-btn');
    const hotelBtn = document.querySelector('.hotel-btn');
    const t_point = document.querySelector('.type-point');
    const propertySearch = document.getElementById('full-search-property');
    const hotelSearch = document.getElementById('full-search-hotel')
    const property = document.getElementById('available-home');
    const hotel = document.querySelector('.hotel-rooms');

    propertyBtn.style.backgroundColor = '#eee';
     //for switching from hotel to house
    propertyBtn.addEventListener('click', () => {
        t_point.style.marginLeft = '30px';
        t_point.style.backgroundColor = '#fff';
        propertyBtn.style.backgroundColor = '#eee';
        hotelBtn.style.backgroundColor = '#fff';
        hotelBtn.style.color = '#000';
        propertySearch.style.display = 'flex';
        hotelSearch.style.display = 'none';
        property.style.display = '';
        hotel.style.display = 'none'
        searchSection.style.display = ''
    });
     //for switching from house to hotel
    hotelBtn.addEventListener('click', () => {
        t_point.style.marginLeft = '250px';
        t_point.style.backgroundColor = '#055';
        hotelBtn.style.backgroundColor = '#055';
        hotelBtn.style.color = '#fff';
        propertyBtn.style.backgroundColor = '#fff';
        hotelSearch.style.display = 'flex';
        propertySearch.style.display = 'none';
        property.style.display = 'none';
        hotel.style.display = 'block'
        searchSection.style.display = 'none'
    });



    //search all 
    const roomAddHouse = document.querySelector('.room-add-house');
    const roomRemoveHouse = document.querySelector('.room-remove-house');
    const roomValueHouse = document.getElementById('room-value-house');
    const cardsForAll = document.querySelectorAll('.listing-card');
    const searchBtnHouse = document.getElementById('search-btn-house');

    let count = 0;

    roomAddHouse.addEventListener('click', () => {
        count++;
        roomValueHouse.value = count;
    });

    roomRemoveHouse.addEventListener('click', () => {
        if (count > 0) {
            count--;
            roomValueHouse.value = count;
        }
    });


    searchBtnHouse.addEventListener('click', () => {
        const cardsForAll = document.querySelectorAll('.listing-card');
        const locationValueHouse = document.getElementById('location-house').value.toLowerCase();
        const propertyValueHouse = document.getElementById('property-house').value.toLowerCase();
        const priceValueHouse = document.getElementById('price-house').value;
        const roomaHouse = roomValueHouse.value;

        cardsForAll.forEach(cfa => {

            let dataNameA = cfa.dataset.title.toLowerCase();
            let dataLocationA = cfa.dataset.location.toLowerCase();
            let dataPriceA = cfa.dataset.price;
            let dataRoomA = cfa.dataset.room;

            let show = true;

            if (propertyValueHouse !== '' && !dataNameA.includes(propertyValueHouse))
                show = false

            if (locationValueHouse !== '' && !dataLocationA.includes(locationValueHouse))
                show = false

            if (priceValueHouse !== '' && !dataPriceA.includes(priceValueHouse))
                show = false

            if (roomaHouse !== '' && !dataRoomA.includes(roomaHouse))
                show = false

            cfa.style.display = show ? '' : 'none';

            document.getElementById('loadMoreBtn').style.display = 'none'
        });
    });


    //normal search
    const searchSection = document.getElementById('search-bar');
    const searchBar = document.getElementById('search');

    searchBar.addEventListener('input', () => {
        const cards = document.querySelectorAll('.listing-card');
        let search = searchBar.value.toLowerCase();

        cards.forEach(card => {
            let dataName = card.getAttribute('data-title').toLowerCase();
            let dataLocation = card.getAttribute('data-location').toLowerCase();
            let dataPrice = card.getAttribute('data-price');
            let dataRoom = card.getAttribute('data-room');

            card.style.display = (
                dataName.includes(search) ||
                dataLocation.includes(search) ||
                dataPrice.includes(search) ||
                dataRoom.includes(search)
            ) ? '' : 'none';
        });
        document.getElementById('loadMoreBtn').style.display = 'none'
    });

    //search for agent
const holdListAgent = document.getElementById('search-agent-list');

async function searchAgent() {
    try {
        const res = await fetch('/api/search/agent');
        const data = await res.json();

        if (!data.success) return;

        const agents = data.agents;
        const searchInput = document.getElementById('search');

        // Hide dropdown initially
        holdListAgent.style.display = 'none';

        // Filter on input
        searchInput.addEventListener('input', () => {
            const searchValue = searchInput.value.toLowerCase().trim();
            if (!searchValue) {
                holdListAgent.style.display = 'none';
                return;
            }
            const filtered = agents.filter(a =>
                a.name.toLowerCase().includes(searchValue)
            );
            renderAgents(filtered);
            document.getElementById('loadMoreBtn').style.display = 'none'
        });

        // Hide when clicking outside
        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !holdListAgent.contains(e.target)) {
                holdListAgent.style.display = 'none';
            }
        });

    } catch (error) {
        console.error('Search agent error:', error);
    }
}

function renderAgents(agents) {
    if (agents.length === 0) {
        holdListAgent.innerHTML = '<div class="agent-search-empty">No agents found</div>';
        holdListAgent.style.display = 'block';
        return;
    }
    holdListAgent.innerHTML = agents.map(a => `
        <a href="/agent-profile?id=${a._id}" class="agent-search-item">
            <div class="agent-search-avatar">
                ${a.profilePicture
                    ? `<img src="${a.profilePicture}" alt="${a.name}">`
                    : `<span>${a.name[0].toUpperCase()}</span>`
                }
            </div>
            <div class="agent-search-info">
                <p class="agent-search-name">${a.name}</p>
                <p class="agent-search-stand">${a.stand.toLowerCase() === 'verified agent'? `<i class="fa-solid fa-circle-check"></i> ${a.stand}` : `${a.stand}`}</p>
            </div>
        </a>
    `).join('');
    holdListAgent.style.display = 'block';
}

// Call on page load
searchAgent();


    //card load
    const btnShow = document.getElementById("loadMoreBtn");

    function hidecard() { /* no-op — infinite scroll handles display */ }

    // Load More button triggers next batch (fallback for users who don't scroll)
    btnShow.addEventListener('click', () => {
        if (!isLoading) {
            currentPage++;
            uploadProperty(currentPage);
        }
    });

    //HOTEL BOOKING FORM
    const bookRoomSection = document.querySelector('.book-room');
    const priceBook = document.getElementById('price-book');
    const submitBook = document.getElementById('submit-book');
    const bookForm = document.getElementById('book-form');
    const bookBtn = document.querySelectorAll('.book-btn');
    const bgf2 = document.querySelector('.bgf2');

    bookRoomSection.style.display = 'none';
    let selectedPrice = 0;

    bookBtn.forEach(bBtn => {
        bBtn.addEventListener('click', () => {
            bookRoomSection.style.display = 'block';
            bgf2.style.display = 'block'
            selectedPrice = parseInt(bBtn.dataset.bookprice);
            priceBook.textContent = `Total: ₦0`
        });
    });
    bgf2.addEventListener('click', () => {
        bookRoomSection.style.display = 'none';
        bgf2.style.display = 'none'
    });

    bookForm.addEventListener('input', (e) => {
        e.preventDefault();

        const bookerName = document.getElementById('booker-name').value;
        const booker_e_or_n = document.getElementById('booker-e-or-n').value;
        const checkIn = document.getElementById('checkin').value;
        const checkOut = document.getElementById('checkout').value;
        const guests = document.getElementById('guests').value;

        if (bookerName && booker_e_or_n && checkIn && checkOut && guests) {
            const inDate = new Date(checkIn);
            const outDate = new Date(checkOut);
            const night = Math.ceil((outDate - inDate) / (1000 * 60 * 60 * 24));
            let resultBook = night * selectedPrice;
            priceBook.textContent = `Total: ₦${resultBook.toLocaleString()}`;
            submitBook.style.opacity = '1';
            submitBook.disabled = false;
        } else {
            submitBook.style.opacity = '0.5';
            submitBook.disabled = true;
        }

    });

    submitBook.addEventListener('click', async (e) => {
        e.preventDefault();
        
        const bookerName = document.getElementById('booker-name').value;
        const bookerContact = document.getElementById('booker-e-or-n').value;
        const checkIn = document.getElementById('checkin').value;
        const checkOut = document.getElementById('checkout').value;
        const guests = document.getElementById('guests').value;

        // Disable button during submission
        submitBook.disabled = true;
        submitBook.textContent = 'Submitting...';

        try {
            const response = await fetch('/api/bookings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    bookerName,
                    bookerContact,
                    checkIn,
                    checkOut,
                    guests,
                    roomPrice: selectedPrice
                })
            });

            const data = await response.json();

            if (data.success) {
                // Store booking data for payment
                localStorage.setItem('currentBooking', JSON.stringify({
                    id: data.bookingId,
                    checkIn,
                    checkOut,
                    guests,
                    nights: data.nights,
                    totalPrice: data.totalPrice,
                    bookerContact
                }));
                localStorage.setItem('currentBookingId', data.bookingId);
                
                // Show success message and redirect to payment
                alertBox.success(
                    'Booking Created Successfully!',
                    `Your booking ID is: ${data.bookingId}\n\nRedirecting to payment page...`,
                    () => {
                        window.location.href = `/payment.html?booking=${data.bookingId}`;
                    }
                );
                
                // Auto redirect after 2 seconds
                setTimeout(() => {
                    window.location.href = `/payment.html?booking=${data.bookingId}`;
                }, 2000);
            } else {
                alertBox.error('Booking Failed', data.message);
            }
        } catch (error) {
            console.error('Booking error:', error);
            alertBox.error('Booking Error', 'An error occurred. Please try again.');
        } finally {
            submitBook.disabled = false;
            submitBook.textContent = 'Submit Booking';
        }
    });

    //service btn
    document.querySelectorAll('.service-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.listing-card').forEach(perCard => {
                perCard.style.display = 'block';
            });
            btnShow.style.display = 'none'
        })
    })

    // scroll animation
    let sections = document.querySelectorAll('.section');

    window.addEventListener('scroll', () => {
        sections = document.querySelectorAll('.section'); // re-query to pick up dynamic cards
        sections.forEach(section => {
            const rect = section.getBoundingClientRect()
            if (rect.top < window.innerHeight - 100 && rect.bottom > 0) {
                section.classList.add('action');
            } else {
                section.classList.remove('action');
            }
        })

    });

    // scroll animation 2

    const sections2 = document.querySelectorAll('.section2');

    window.addEventListener('scroll', () => {
        sections2.forEach(section => {
            const rect = section.getBoundingClientRect()
            if (rect.top < window.innerHeight - 100 && rect.bottom > 0) {
                section.classList.add('action2');
            } else {
                section.classList.remove('action2');
            }
        })

    });

    // scroll animation count

    const animeCount1 = document.querySelector('.anime-count1');
    const animeCount2 = document.querySelector('.anime-count2');
    const animeCount3 = document.querySelector('.anime-count3');
    const animeCount4 = document.querySelector('.anime-count4');
    let aCount1 = 0;
    let aCount2 = 0;
    let aCount3 = 0;
    let aCount4 = 0;

    let timeCount = true;

    const runCount = () => {
        let interval = setInterval(() => {
            aCount1 += 1000;
            animeCount1.innerHTML = `${aCount1}+`;
            if (aCount1 == 9000) {
                clearInterval(interval);
                animeCount1.innerHTML = '10,000+'
            }
        }, 100);
        let interval2 = setInterval(() => {
            aCount2 += 200;
            animeCount2.innerHTML = `${aCount2}+`;
            if (aCount2 == 1000) {
                clearInterval(interval2);
                animeCount2.innerHTML = '3,200+'
            }
        }, 100);
        let interval3 = setInterval(() => {
            aCount3 += 100;
            animeCount3.innerHTML = `${aCount3}+`;
            if (aCount3 == 400) {
                clearInterval(interval3);
                animeCount3.innerHTML = '500+'
            }
        }, 100);

        timeCount = false
    }


    window.addEventListener('scroll', () => {

        const rect = animeCount1.getBoundingClientRect()
        if (rect.top < window.innerHeight)
            if (timeCount) runCount()
    });

    // Load verified agents
    async function loadVerifiedAgents() {
        try {
            const res = await fetch('/api/agents/verified');
            const data = await res.json();
            
            const container = document.getElementById('agents-container');
            
            if (data.success && data.agents.length > 0) {
                container.innerHTML = data.agents.map(agent => `
                <div class="agent-card">
                    ${agent.profilePicture? 
                       `<img src="${agent.profilePicture || 'https://via.placeholder.com/150'}" loading="lazy" alt="${agent.name}">`
                       : `<i class="fa-solid fa-user-tie" id="avatar"></i>`
                    }
                    
                    <h3>${agent.name}</h3>
                    <p><i class="fa-solid fa-circle-check"></i> ${agent.stand || 'Verified Agent'}</p>
                    <a href="/agent-profile?id=${agent.id}" class="agent-btn">View Profile</a>
                </div>
                `).join('');
            } else {
                container.innerHTML = '<p style="text-align: center; color: #666; padding: 2rem;">No verified agents available at the moment.</p>';
            }
        } catch (err) {
            console.error('Error loading agents:', err);
            document.getElementById('agents-container').innerHTML = '<p style="text-align: center; color: #666; padding: 2rem;">Failed to load agents.</p>';
        }
    }

    // Load agents when page loads
    loadVerifiedAgents();

    // Message input Validation
    const contactAlertBox = document.getElementById('alert');

    const submitBtn = document.getElementById('submit');

    submitBtn.addEventListener('click', (e) => {
        e.preventDefault();

        const name = document.getElementById('name').value;
        const nameErr = document.getElementById('name-err');
        const email = document.getElementById('email').value;
        const emailErr = document.getElementById('email-err');
        const subjet = document.getElementById('subjet').value;
        const text = document.getElementById('text').value;
        const textErr = document.getElementById('text-err');
        const phoneNumber = document.getElementById('phone-number').value;
        const phoneErr = document.getElementById('phone-err');

        nameErr.style.color = 'red';
        emailErr.style.color = 'red';
        textErr.style.color = 'red';
        phoneErr.style.color = 'red';
        nameErr.textContent = ''
        emailErr.textContent = ''
        textErr.textContent = ''
        phoneErr.textContent = ''

        let valid = true;

        if (name.length < 1) {
            nameErr.textContent = 'Enter Your name';
            valid = false
        } else if (name.length < 4) {
            nameErr.textContent = 'Your name must be at least more than 4 Characters';
            valid = false
        }

        let emalValidation = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (email === "") {
            emailErr.textContent = 'Enter Your email';
            valid = false
        } else if (!emalValidation.test(email)) {
            emailErr.textContent = 'Enter a valid email';
            valid = false
        }

        if (text.length < 1) {
            textErr.textContent = 'Make a statement';
            valid = false
        } else if (text.length < 10) {
            textErr.textContent = 'Your statement must be at least 4 words';
            valid = false
        }

        if (phoneNumber.length === 0) {
            phoneErr.textContent = 'Enter Your number';
            valid = false
        } else if (phoneNumber.length != 11) {
            phoneErr.textContent = 'Your number must be 11 digits';
            valid = false
        }

        if (valid) {
            // Show loading state
            const submitButton = document.getElementById('submit');
            const originalButtonText = submitButton.innerHTML;
            submitButton.disabled = true;
            submitButton.innerHTML = '<span class="btn-text">Sending...</span>';

            // Send to backend API (saves to admin inbox)
            fetch('/api/contact/submit', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    name: name,
                    email: email,
                    subjet: subjet,
                    phoneNumber: phoneNumber,
                    text: text
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Also send via EmailJS (optional - for email notifications)
                    emailjs.send("service_2gmwz4n", "template_ta3lzir", {
                        from_name: name,
                        from_email: email,
                        from_subjet: subjet,
                        from_number: phoneNumber,
                        from_text: text
                    }).catch(err => console.log('EmailJS error:', err));

                    contactAlertBox.innerHTML = '<i class="fa-solid fa-circle-check"></i> Message sent successfully!';
                    contactAlertBox.className = 'success';
                    contactAlertBox.style.display = 'block';
                    setTimeout(() => {
                        contactAlertBox.style.display = 'none';
                    }, 3000);
                    document.querySelector('.contact-form').reset();
                } else {
                    contactAlertBox.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Error: ' + (data.message || 'Message not sent');
                    contactAlertBox.className = 'error';
                    contactAlertBox.style.display = 'block';
                    setTimeout(() => {
                        contactAlertBox.style.display = 'none';
                    }, 3000);
                }
            })
            .catch((err) => {
                console.error('Error sending message:', err);
                contactAlertBox.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Error: Could not send message';
                contactAlertBox.className = 'error';
                contactAlertBox.style.display = 'block';
                setTimeout(() => {
                    contactAlertBox.style.display = 'none';
                }, 3000);
            })
            .finally(() => {
                submitButton.disabled = false;
                submitButton.innerHTML = originalButtonText;
            });
        }

    });

    //feedback toggle
    const clientsFB = document.querySelector('.clients-feedback');
    const clientsBtn = document.getElementById('client-btn');
    clientsBtn.addEventListener('click', () => {
        clientsFB.classList.toggle('feed-move');
        clientsBtn.classList.toggle('feed-move')
    })

    //LOGIN
    const loginPage = document.querySelector('.login');
    const loginBtn = document.getElementById('login-btn');
    const cancelIcon = document.getElementById('cancel-login-icon');
    const userLog = document.getElementById('user-log');
    const loginEye = document.getElementById('login-eye');
    const signupEye = document.getElementById('signup-eye');
    const loginPassword = document.getElementById('login-password');
    const signupPassword = document.getElementById('signup-password');
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const linkToSignup = document.getElementById('link-to-signup');
    const linkToLogin = document.getElementById('link-to-login');
    const logAlert = document.getElementById('log-alert');
    const logoutBtn = document.querySelector('.btn-logout');
    const loginNav = document.getElementById('login-nav-hero');
    const holdLogin = document.querySelector('.hold-login');

    holdLogin.style.right = '-10rem'

    loginNav.addEventListener('click', (e) => {
        e.stopPropagation();
        holdLogin.classList.toggle('open');
    });

    // Check if user is already logged in via session cookie
    async function isAuth() {
        try {
            // for normal user
            const res = await fetch('/api/user/profile', { credentials: 'include' });
            const data = await res.json();
            // for agent
            const resAgent = await fetch('/api/agent/profile', { credentials: 'include' });
            const dataAgent = await resAgent.json();

            if (data.success) {
                loginNav.style.display = 'none';
                logoutBtn.style.display = 'flex';
                userLog.style.display = 'flex';
                userLog.textContent = data.user.name[0].toUpperCase();
            } else if (dataAgent.success) {
                loginNav.style.display = 'none';
                logoutBtn.style.display = 'flex';
                userLog.style.display = 'flex';
                if (dataAgent.agent.profilePicture) {
                    userLog.innerHTML = `<img src="${dataAgent.agent.profilePicture}" alt="${dataAgent.agent.name}" style="width:40px;height:40px;object-fit:cover;border-radius:50%;">`;
                    userLog.style.background = 'transparent';
                    userLog.style.right = '2.1rem';
                    userLog.style.padding = '0';
                    userLog.style.border = '3px solid #0b6a6dff';
                } else {
                    userLog.textContent = dataAgent.agent.name[0].toUpperCase();
                }
                userLog.addEventListener('click', () => {
                    window.location.href = '/agent-loged'
                });
            }

        } catch (error) {
            console.error('Auth check failed:', error);
        }
    }
    isAuth();

    // Logout
    if (userLog) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await fetch('/api/logout', { method: 'POST', credentials: 'include' });
                userLog.style.display = 'none';
                logoutBtn.style.display = 'none';
                loginNav.style.display = 'flex';
                userLog.textContent = '';
                showLoginAlert('Logged out successfully', 'success');
            } catch (error) {
                console.error('Logout error:', error);
                showLoginAlert('Something went wrong, try again later', 'error');
            }
        });
    }

    // Password visibility toggle for login
    if (loginPassword && loginEye) {
        console.log('Login eye icon found:', loginEye);
        loginPassword.type = 'password';
        loginEye.style.display = 'inline-block';
        loginEye.addEventListener('click', () => {
            console.log('Login eye clicked');
            if (loginPassword.type === 'password') {
                loginPassword.type = 'text';
                loginEye.classList.remove('fa-eye');
                loginEye.classList.add('fa-eye-slash');
            } else {
                loginPassword.type = 'password';
                loginEye.classList.remove('fa-eye-slash');
                loginEye.classList.add('fa-eye');
            }
        });
    } else {
        console.log('Login password or eye not found:', { loginPassword, loginEye });
    }

    // Password strength validation
    function validatePasswordStrength(password) {
        const requirements = {
            length: password.length >= 8,
            uppercase: /[A-Z]/.test(password),
            lowercase: /[a-z]/.test(password),
            number: /\d/.test(password)
        };
        
        const isValid = Object.values(requirements).every(req => req);
        
        return {
            isValid,
            requirements,
            message: isValid ? 'Password is strong' : 'Password does not meet requirements'
        };
    }

    // Add password strength indicator
    function addPasswordStrengthIndicator(passwordInput, containerId) {
        const container = document.getElementById(containerId);
        if (!container || !passwordInput) return;

        // Create strength indicator
        const strengthDiv = document.createElement('div');
        strengthDiv.className = 'password-strength';
        strengthDiv.innerHTML = `
            <div class="strength-bar">
                <div class="strength-fill"></div>
            </div>
            <div class="strength-requirements">
                <div class="req" data-req="length">✗ At least 8 characters</div>
                <div class="req" data-req="uppercase">✗ One uppercase letter</div>
                <div class="req" data-req="lowercase">✗ One lowercase letter</div>
                <div class="req" data-req="number">✗ One number</div>
            </div>
        `;
        
        // Insert after the span container (parent of password input)
        const spanContainer = passwordInput.parentNode;
        spanContainer.parentNode.insertBefore(strengthDiv, spanContainer.nextSibling);

        // Add event listener
        passwordInput.addEventListener('input', () => {
            const validation = validatePasswordStrength(passwordInput.value);
            const strengthFill = strengthDiv.querySelector('.strength-fill');
            const requirements = strengthDiv.querySelectorAll('.req');
            
            // Update strength bar
            const strength = Object.values(validation.requirements).filter(Boolean).length;
            const percentage = (strength / 4) * 100;
            strengthFill.style.width = percentage + '%';
            
            // Update color based on strength
            if (percentage < 50) {
                strengthFill.style.backgroundColor = '#ff4444';
            } else if (percentage < 75) {
                strengthFill.style.backgroundColor = '#ffaa00';
            } else {
                strengthFill.style.backgroundColor = '#00aa00';
            }
            
            // Update requirements
            requirements.forEach(req => {
                const reqType = req.dataset.req;
                if (validation.requirements[reqType]) {
                    req.innerHTML = req.innerHTML.replace('✗', '✓');
                    req.style.color = '#00aa00';
                } else {
                    req.innerHTML = req.innerHTML.replace('✓', '✗');
                    req.style.color = '#ff4444';
                }
            });
            
            // Show/hide based on focus and content
            if (passwordInput.value.length > 0) {
                strengthDiv.style.display = 'block';
            } else {
                strengthDiv.style.display = 'none';
            }
        });

        // Hide on blur if password is strong
        passwordInput.addEventListener('blur', () => {
            const validation = validatePasswordStrength(passwordInput.value);
            if (validation.isValid) {
                setTimeout(() => {
                    strengthDiv.style.display = 'none';
                }, 2000);
            }
        });

        // Show on focus
        passwordInput.addEventListener('focus', () => {
            if (passwordInput.value.length > 0) {
                strengthDiv.style.display = 'block';
            }
        });
    }

    // Initialize password strength indicators
    if (signupPassword) {
        addPasswordStrengthIndicator(signupPassword, 'signup-form');
    }
    if (signupPassword && signupEye) {
        console.log('Signup eye icon found:', signupEye);
        signupPassword.type = 'password';
        signupEye.style.display = 'inline-block'; // Force display
        signupEye.addEventListener('click', () => {
            console.log('Signup eye clicked');
            if (signupPassword.type === 'password') {
                signupPassword.type = 'text';
                signupEye.classList.remove('fa-eye');
                signupEye.classList.add('fa-eye-slash');
            } else {
                signupPassword.type = 'password';
                signupEye.classList.remove('fa-eye-slash');
                signupEye.classList.add('fa-eye');
            }
        });
    } else {
        console.log('Signup password or eye not found:', { signupPassword, signupEye });
    }

    // Form switching
    if (linkToSignup) {
        linkToSignup.addEventListener('click', () => {
            loginForm.classList.add('hidden');
            signupForm.classList.remove('hidden');
            loginPage.querySelector('h1').textContent = 'Create Account';
        });
    }

    if (linkToLogin) {
        linkToLogin.addEventListener('click', () => {
            signupForm.classList.add('hidden');
            loginForm.classList.remove('hidden');
            loginPage.querySelector('h1').textContent = 'Welcome Back';
        });
    }

    // Show/hide login modal
    if (loginBtn) {
        loginBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            loginPage.classList.toggle('log');
        });
    }
    if (cancelIcon) {
        cancelIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            loginPage.classList.toggle('log');
        });
    }

    // Close login modal when clicking outside
    window.addEventListener('click', (e) => {
        if (loginPage && !loginPage.contains(e.target) && !loginBtn.contains(e.target)) {
            loginPage.classList.remove('log');
        }
        // close hold-login if clicking outside
        if (!holdLogin.contains(e.target) && !loginNav.contains(e.target)) {
            holdLogin.classList.remove('open');
        }
        //close nav2 logic
        if (!hamburger.contains(e.target) && !nav2.contains(e.target)) {
            hamburger.classList.remove('active');
            nav2.classList.remove('active');
            bg.style.display = 'none';
        }
    });

    // Show alert function
    function showLoginAlert(message, type = 'info') {
        if (logAlert) {
            logAlert.textContent = message;
            logAlert.className = `show ${type}`;
            setTimeout(() => {
                logAlert.classList.remove('show');
            }, 3000);
        }
    }

    // Login form submission - Unified for both admin and users
    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            
            const submitBtn = loginForm.querySelector('input[type="submit"]');
            const originalText = submitBtn.value;
            
            // Show loading state
            submitBtn.classList.add('loading');
            submitBtn.value = 'Signing In...';
            submitBtn.disabled = true;

            const formData = new FormData(loginForm);
            
            // Debug: Log form data
            console.log('=== LOGIN FORM SUBMISSION ===');
            console.log('Email:', formData.get('email'));
            console.log('Password:', formData.get('password') ? '***' : 'MISSING');

            try {
                const res = await fetch("/api/login", {
                    method: "POST",
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        email: formData.get('email'),
                        password: formData.get('password')
                    })
                });
                
                const data = await res.json();
                
                if (data.success) {
                    showLoginAlert('Login successful!', 'success');
                    
                    // Check if admin or regular user
                    if (data.admin) {
                        // Admin login
                        setTimeout(() => { window.location.href = '/admin'; }, 1000);
                    } else if (data.user) {
                        // Regular user login
                        userLog.textContent = data.user.name[0];
                        loginNav.style.display = 'none';
                        holdLogin.style.right = '-10rem';
                        userLog.style.display = 'flex';
                        logoutBtn.style.display = 'flex';
                        loginPage.classList.remove('log');
                        loginForm.reset();
                    }
                } else {
                    showLoginAlert(data.message || 'Login failed', 'error');
                }
            } catch (err) {
                console.error("Login error", err);
                showLoginAlert('Login failed. Please try again.', 'error');
            } finally {
                // Reset button state
                submitBtn.classList.remove('loading');
                submitBtn.value = originalText;
                submitBtn.disabled = false;
            }
        });
    }

    //signup
    // Signup form submission (updated)
    if (signupForm) {
        signupForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            
            const submitBtn = signupForm.querySelector('input[type="submit"]');
            const originalText = submitBtn.value;
            
            // Get form data
            const formData = new FormData(signupForm);
            const signupData = {
                name: formData.get('name'),
                email: formData.get('email'),
                number: formData.get('number'),
                password: formData.get('password')
            };

            // Validate password strength on client side
            const passwordValidation = validatePasswordStrength(signupData.password);
            if (!passwordValidation.isValid) {
                showLoginAlert('Password does not meet security requirements', 'error');
                return;
            }
            
            // Show loading state
            submitBtn.classList.add('loading');
            submitBtn.value = 'Creating Account...';
            submitBtn.disabled = true;

            try {
                const response = await fetch('/api/signup', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(signupData)
                });

                const data = await response.json();

                if (data.success) {
                    showLoginAlert(`Account created successfully! Welcome ${signupData.name}!`, 'success');
                    
                    // Store user info in localStorage
                    localStorage.setItem('user', JSON.stringify({
                        id: data.userId,
                        name: signupData.name,
                        email: signupData.email
                    }));
                    
                    // Hide login button and show user name
                    loginNav.style.display = 'none';
                    holdLogin.style.right = '-10rem'
                    userLog.style.display = 'flex';
                    userLog.textContent = signupData.name[0];
                    logoutBtn.style.display = 'flex';
                    
                    // Close login modal
                    loginPage.classList.remove('log');
                    
                    // Reset form
                    signupForm.reset();
                } else {
                    showLoginAlert(data.message, 'error');
                }
            } catch (err) {
                console.error("Signup error", err);
                showLoginAlert('Signup failed. Please try again.', 'error');
            } finally {
                // Reset button state
                submitBtn.classList.remove('loading');
                submitBtn.value = originalText;
                submitBtn.disabled = false;
            }
        });
    }

    // Legacy signup handler (keep for compatibility)
    const signUp = document.getElementById('signup-form');
    if (signUp && signUp !== signupForm) {
        signUp.addEventListener('submit', async (e) => {
            e.preventDefault();

            const formData = new FormData(signUp);
            const signupData = {
                name: formData.get('name'),
                email: formData.get('email'),
                number: formData.get('number'),
                password: formData.get('password')
            };

            // Validate password strength
            const passwordValidation = validatePasswordStrength(signupData.password);
            if (!passwordValidation.isValid) {
                showLoginAlert('Password does not meet security requirements', 'error');
                return;
            }

            try {
                const res = await fetch('/api/signup', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(signupData)
                });

                const data = await res.json();

                if (data.success) {
                    showLoginAlert(`Account created! Welcome ${signupData.name}!`, 'success');
                    
                    // Store user info in localStorage
                    localStorage.setItem('user', JSON.stringify({
                        id: data.userId,
                        name: signupData.name,
                        email: signupData.email
                    }));
                    
                    // Hide login button and show user name
                    loginNav.style.display = 'none';
                    holdLogin.style.right = '-10rem'
                    userLog.style.display = 'flex';
                    userLog.textContent = signupData.name[0];
                    logoutBtn.style.display = 'flex';
                    
                    // Close login modal
                    loginPage.classList.remove('log');
                    
                    // Reset form
                    signUp.reset();
                } else {
                    showLoginAlert(data.message, 'error');
                }
            } catch (error) {
                console.error('Signup error:', error);
                showLoginAlert('Signup failed. Please try again.', 'error');
            }
        });
    }

    //feeling 
    const feeling = document.querySelector('.feeling');
    const feelingC = document.querySelectorAll('.f');
    const bgf = document.querySelector('.bgf');

    setTimeout(() => {
        feeling.style.display = 'block';
        bgf.style.display = 'flex';
    }, 400000)

    bgf.addEventListener('click', () => {
        feeling.style.display = 'none';
        bgf.style.display = 'none';
    })

    feelingC.forEach((f, index) => {
        f.addEventListener('click', () => {
            emailjs.send("service_2gmwz4n", "template_ta3lzir", {
                    feedback: `User selected feeling ${index + 1}`
                })
                .then(() => console.log('send'))
                .catch((err) => console.error('not send', err));
            feeling.style.display = 'none';
            bgf.style.display = 'none';
        });
    });

    //hold login nav
    window.addEventListener('click', (e) => {
        if (!loginNav.contains(e.target)) {
            if (holdLogin.style.right === '1.8rem') {
                holdLogin.style.right = '-10rem'
            }
        }
    })

    const waLink = document.querySelector('.wa-link');
    waLink.addEventListener('click', () => {
        const waURL = 'https://wa.me/2347042648065?text=Hello Easy Find'
        window.open(waURL, '_blank')
    });