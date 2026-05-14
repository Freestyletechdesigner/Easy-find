    // on page load, check if Paystack redirected back with a reference
    const urlParams = new URLSearchParams(window.location.search);
    const reference = urlParams.get('reference');

    if (reference) {
        // hide the normal UI and show a verifying state
        document.getElementById('stepTitle').textContent = 'Verifying Payment...';
        document.getElementById('stepSub').textContent   = 'Please wait while we confirm your transaction.';
        document.getElementById('dot2').classList.add('active');
        document.getElementById('dot3').classList.add('active');
        showView(2); // show step 2 as placeholder while verifying

        // call the backend to verify the transaction
        fetch(`/api/payment-boost/verify?reference=${reference}`)
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    // payment confirmed — move to success screen
                    currentStep = 3;
                    document.getElementById('stepTitle').textContent = 'Payment Confirmed';
                    document.getElementById('stepSub').textContent   = '';
                    document.querySelector('.back-home').style.display = 'none';
                    showView(3);
                    // clean the URL so refreshing doesn't re-verify
                    window.history.replaceState({}, '', '/boost-account');
                } else {
                    document.getElementById('stepTitle').textContent = 'Payment Failed';
                    document.getElementById('stepSub').textContent   = data.message || 'Transaction could not be verified.';
                }
            })
            .catch(() => {
                document.getElementById('stepTitle').textContent = 'Verification Error';
                document.getElementById('stepSub').textContent   = 'Network error. Please contact support.';
            });
    }

    // track which step the user is currently on (1 = plan, 2 = payment, 3 = success)
    let currentStep  = 1;

    // default selected plan is single post boost
    let selectedPlan = 'post';

    // default price matching the post boost plan
    let selectedAmt  = 950;

    // human-readable label shown in the payment summary
    let selectedLabel = 'Single Post Boost';

    // stores the post the agent picked to boost
    let selectedPostId    = null;
    let selectedPostTitle = null;

    // called when user clicks a plan card
    function selectPlan(type, price, el) {
        // remove selected style from all plan cards
        document.querySelectorAll('.plan-card').forEach(c => c.classList.remove('selected'));

        // highlight the clicked card
        el.classList.add('selected');

        // store the chosen plan type (post or profile)
        selectedPlan  = type;

        // store the price for this plan
        selectedAmt   = price;

        // store the display label for the summary screen
        selectedLabel = type === 'post' ? 'Single Post Boost' : 'Profile Boost';

        // if post boost, open the post picker panel
        if (type === 'post') openPostPicker();
    }

    // open the post picker and load the agent's posts
    function openPostPicker() {
        document.getElementById('postPickerOverlay').classList.add('open');
        const list = document.getElementById('postPickerList');
        list.innerHTML = '<div class="post-picker-loading"><i class="fas fa-spinner fa-spin"></i> Loading your posts...</div>';

        // fetch the agent's own posts
        fetch('/api/agent/property')
            .then(r => r.json())
            .then(data => {
                if (!data.success || !data.property.length) {
                    list.innerHTML = '<div class="post-picker-loading">No posts found.</div>';
                    return;
                }
                // render each post as a selectable item
                list.innerHTML = data.property.map(p => {
                    const img   = p.imageNames && p.imageNames.length
                        ? `/agent-loged/upload-property/${p.imageNames[0]}`
                        : '/icon/home icon.png';
                    const price = Number(p.price).toLocaleString();
                    return `
                        <div class="post-item" onclick="pickPost('${p._id}', '${(p.title || p.type || 'Property').replace(/'/g, '')}', this)">
                            <img src="${img}" onerror="this.src='/icon/home icon.png'">
                            <div class="post-item-info">
                                <b>${p.title || p.type || 'Property'}</b>
                                <span>₦${price} • ${p.location || 'N/A'}</span>
                            </div>
                            <i class="fas fa-check-circle post-item-check"></i>
                        </div>
                    `;
                }).join('');
            })
            .catch(() => {
                list.innerHTML = '<div class="post-picker-loading">Failed to load posts.</div>';
            });
    }

    // called when agent taps a post in the picker
    function pickPost(id, title, el) {
        // deselect all items
        document.querySelectorAll('.post-item').forEach(i => i.classList.remove('picked'));

        // mark this one as picked
        el.classList.add('picked');

        // store the selected post id and title
        selectedPostId    = id;
        selectedPostTitle = title;

        // close the panel after a short delay so user sees the selection
        setTimeout(() => closePostPicker(), 300);
    }

    // close the post picker panel
    function closePostPicker() {
        document.getElementById('postPickerOverlay').classList.remove('open');
    }

    // close picker if user taps the dark overlay background
    document.getElementById('postPickerOverlay').addEventListener('click', function(e) {
        if (e.target === this) closePostPicker();
    });

    // move forward from step 1 to step 2
    function nextStep() {
        if (currentStep === 1) {
            // if post boost, require a post to be selected first
            if (selectedPlan === 'post' && !selectedPostId) {
                openPostPicker();
                return;
            }

            // advance the step counter
            currentStep = 2;

            // populate the summary box with the chosen plan name
            document.getElementById('summaryName').textContent   = selectedLabel;

            // populate the summary box with the formatted price
            document.getElementById('summaryAmount').textContent = `₦${selectedAmt.toLocaleString()}`;

            // update the pay button label with the correct amount
            document.getElementById('payAmount').textContent     = `₦${selectedAmt.toLocaleString()}`;

            // update the step header title
            document.getElementById('stepTitle').textContent = 'Secure Checkout';

            // update the step header subtitle
            document.getElementById('stepSub').textContent   = 'Complete your payment below';

            // mark step 2 dot as active in the progress indicator
            document.getElementById('dot2').classList.add('active');

            // show the payment view
            showView(2);
        }
    }

    // go back from step 2 to step 1
    function prevStep() {
        if (currentStep === 2) {
            // go back to step 1
            currentStep = 1;

            // restore the plan selection header title
            document.getElementById('stepTitle').textContent = 'Choose a Plan';

            // restore the plan selection header subtitle
            document.getElementById('stepSub').textContent   = 'Select the boost that fits your goal';

            // deactivate step 2 dot in the progress indicator
            document.getElementById('dot2').classList.remove('active');

            // show the plan selection view
            showView(1);
        }
    }

    // hide all views and show only the requested one
    function showView(n) {
        // remove active class from every view panel
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

        // activate the target view by number
        document.getElementById('view' + n).classList.add('active');
    }

    // called when user clicks the Pay button
    function processPayment() {
        // get the pay button element
        const btn = document.getElementById('payBtn');

        // disable button to prevent double clicks
        btn.disabled = true;

        // show a spinner while processing
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

        // get and trim the email the user entered
        const email = document.getElementById('payerEmail').value.trim();

        // validate email is not empty
        if (!email) {
            // re-enable button if validation fails
            btn.disabled = false;
            btn.innerHTML = `Pay <span id="payAmount">₦${selectedAmt.toLocaleString()}</span>`;
            alertBox.warning('Missing Email', 'Please enter your email address.');
            return;
        }

        // build the request body with email and selected plan
        const body = { email, plan: selectedPlan };

        // if boosting a single post, attach the picked post id
        if (selectedPlan === 'post' && selectedPostId) {
            body.postId = selectedPostId;
        }

        // send the payment initialization request to the backend
        fetch('/api/payment-boost', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
        .then(r => r.json())
        .then(data => {
            // if successful, redirect to Paystack's hosted payment page
            if (data.success && data.data.authorization_url) {
                window.location.href = data.data.authorization_url;
            } else {
                // show error and re-enable button
                alertBox.error('Payment Failed', data.message || 'Payment initialization failed');
                btn.disabled = false;
                btn.innerHTML = `Pay <span>₦${selectedAmt.toLocaleString()}</span>`;
            }
        })
        .catch(() => {
            // handle network errors
            alertBox.error('Network Error', 'Network error. Please try again.');
            btn.disabled = false;
            btn.innerHTML = `Pay <span>₦${selectedAmt.toLocaleString()}</span>`;
        });
    }