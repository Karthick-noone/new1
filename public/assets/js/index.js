let roomLimit; // Declare roomLimit in a higher scope
document.addEventListener('DOMContentLoaded', async function() {
    try {
        const response = await fetch('getTotalRooms.php');
        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        roomLimit = data.totalRooms; // Assign value to roomLimit

        // Update your UI or perform any logic with the totalRooms value
        document.getElementById('totalRooms').innerText = `Total Rooms: ${roomLimit}`;

        // Add the event listener for the increment button after fetching totalRooms
        document.getElementById('incrementRooms').addEventListener('click', function() {
            increment('rooms');
        });
    } catch (error) {
        console.error('Error fetching total rooms:', error);
    }
});

document.addEventListener('DOMContentLoaded', function() {
    // Set default values for Check In and Check Out
    var today = new Date();
    var tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1); // Adjusted to 1 day for a range

    // Set maxDate for Check In to be 90 days from today
    var maxDateCheckIn = new Date();
    maxDateCheckIn.setDate(today.getDate() + 90);

    // Initialize Pikaday for both "Check In" and "Check Out"
    var pickerIn = new Pikaday({
        field: document.getElementById('date-in'),
        minDate: today, // Set minDate to disable previous days
        maxDate: maxDateCheckIn, // Set maxDate to 90 days from today
        onSelect: function(date) {
            // When "Check In" date is selected, manually set the formatted value
            this.el.value = formatDate(date);
            // Update "Check Out" options
            updateCheckOutOptions(date);
        },
    });

    // Initially set "Check Out" datepicker to be 90 days from today
    var initialMaxDateCheckOut = new Date();
    initialMaxDateCheckOut.setDate(today.getDate() + 90);

    var pickerOut = new Pikaday({
        field: document.getElementById('date-out'),
        minDate: tomorrow, // Set initial minDate
        maxDate: initialMaxDateCheckOut, // Set maxDate to 90 days from today
    });

    // Update the default values for "Check In" and "Check Out"
    document.getElementById('date-in').value = formatDate(today);
    document.getElementById('date-out').value = formatDate(tomorrow);

    // Make input fields read-only
    document.getElementById('date-in').readOnly = true;
    document.getElementById('date-out').readOnly = true;

    function updateCheckOutOptions(checkInDate) {
        // Calculate the date to disable (up to 90 days from Check In date)
        var disabledDate = new Date(checkInDate);
        disabledDate.setDate(disabledDate.getDate() + 90);

        // Update "Check Out" datepicker
        pickerOut.setMinDate(new Date(checkInDate)); // Set minDate to the selected "Check In" date
        pickerOut.setMaxDate(disabledDate); // Set maxDate to 90 days from the selected "Check In" date

        // Automatically set the "Check Out" date to be one day after the new "Check In" date
        var newCheckOutDate = new Date(checkInDate);
        newCheckOutDate.setDate(newCheckOutDate.getDate() + 1);
        
        // Disable "Check In" date in "Check Out" datepicker
        pickerOut.setMinDate(newCheckOutDate);
        
        pickerOut.setDate(newCheckOutDate);
        document.getElementById('date-out').value = formatDateWithoutComma(newCheckOutDate);
    }

    function formatDate(date) {
        // Format date as "7 December, 2023"
        return date.toLocaleString('en-US', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    }

    function formatDateWithoutComma(date) {
        // Format date as "7 December 2023" without a comma
        const day = String(date.getDate()).padStart(2, '0'); // Add leading zeros if needed
        const month = date.toLocaleString('en-US', {
            month: 'short'
        });
        const year = date.getFullYear();
        return `${date.toLocaleString('en-US', { weekday: 'short' })} ${month} ${day} ${year}`;
    }
});

    const guestsInput = document.getElementById('guest');
    guestsInput.defaultValue = '1 Room, 2 Adults, 0 Children'; // Use .value instead of .innerHTML
    // Function to format the date as "day month year" for display
    function formatDate(date) {
        const day = String(date.getDate()).padStart(2, '0'); // Add leading zeros if needed
        const month = date.toLocaleString('en-US', {
            month: 'short'
        });
        const year = date.getFullYear();
        return `${date.toLocaleString('en-US', { weekday: 'short' })} ${month} ${day} ${year}`;
    }

    function showGuestsContainer() {
        const guestsContainer = document.getElementById('guestsContainer');

        // Check the current display status
        const currentDisplay = window.getComputedStyle(guestsContainer).display;

        // Toggle the display
        guestsContainer.style.display = currentDisplay === 'none' ? 'block' : 'none';

        // Set default values only if the container is displayed
        if (guestsContainer.style.display === 'block') {
            // Set default values for adults and rooms to 1, and children to 0
            document.getElementById('adults').value = 2; // Default to 2 adults
            document.getElementById('rooms').value = 1;
            document.getElementById('children').value = 0;

            // Update the label for "Room" based on the selected value

            // Update the guests input field with default values
            const guestsInput = document.getElementById('guest');
            guestsInput.innerHTML = '1 Room, 2 Adults, 0 Children';

            // Disable the decrement buttons for adults and rooms initially
            updateDecrementButtonsState();
        }
    }

    function showGuestsDefaultValues() {
        // Set default values for Guests
        document.getElementById('rooms').placeholder = '1';
        document.getElementById('adults').placeholder = '2';
        document.getElementById('children').placeholder = '0';


    }

    document.addEventListener('DOMContentLoaded', function() {
        // Set default values for Check In and Check Out
        var today = new Date();
        var tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1); // Adjusted to 1 day for a range
        document.getElementById('date-in').value = formatDate(today);
        document.getElementById('date-out').value = formatDate(tomorrow);

        showGuestsDefaultValues();

        // Set default values for Guests
        document.getElementById('rooms').placeholder = '1';
        document.getElementById('adults').placeholder = '2';
        document.getElementById('children').placeholder = '0';
    });

    function toggleContainer(event) {
        event.preventDefault();
        var guestsContainer = document.getElementById('guestsContainer');
        guestsContainer.style.display = guestsContainer.style.display === 'none' || guestsContainer.style.display === '' ? 'flex' : 'none';

        // Reset the validation message when the container is toggled
        const validationMessageElement = document.getElementById('validationMessage');
        validationMessageElement.innerHTML = '';
    }

    function updateGuestsInput() {
        const rooms = parseInt(document.getElementById('rooms').value, 10);
        const adults = document.getElementById('adults').value;
        const children = document.getElementById('children').value;
        const guestsInput = document.getElementById('guest');

        // Determine whether to use singular or plural for "Room"
        const roomLabel = rooms === 1 ? 'Room' : 'Rooms';

        // Check if any of the input values are empty, and set default values if needed
        const roomsValue = isNaN(rooms) || rooms <= 0 ? 1 : rooms;
        const adultsValue = adults.trim() === '' ? 2 : adults;
        const childrenValue = children.trim() === '' ? 0 : children;

        guestsInput.value = `${roomsValue} ${roomLabel}, ${adultsValue} Adult${adults == 1?'':'s'}, ${childrenValue} Children`;

        // Update the state of decrement buttons
        updateDecrementButtonsState();
    }

    function increment(inputId) {
        const input = document.getElementById(inputId);
        const errorMessage = document.getElementById('errorMessage');

        // Check if the input is for rooms
        if (inputId === 'rooms') {
            if (parseInt(input.value) < roomLimit) {
                input.value = parseInt(input.value) + 1;
            } else {
                errorMessage.innerText = `Only ${roomLimit} rooms are available in this hotel.`;

                // Set a timeout to clear the error message after 3 seconds (adjust as needed)
                setTimeout(function() {
                    errorMessage.innerText = '';
                }, 4000);

                return; // Prevent incrementing beyond the limit
            }
        } else {
            // For other inputs, increment as usual
            input.value = parseInt(input.value) + 1;
        }

        // Perform common updates for all inputs
        updateGuestsInput();
        updateDecrementButtonsState();
    }

    function decrement(inputId) {
        const input = document.getElementById(inputId);
        if (inputId === 'children' && parseInt(input.value) > 0) {
            input.value = parseInt(input.value) - 1;
        } else if (inputId !== 'children' && parseInt(input.value) > 1) {
            input.value = parseInt(input.value) - 1;
        }
        updateGuestsInput();
    }

    // Function to update the state of decrement buttons
    function updateDecrementButtonsState() {
        const adults = document.getElementById('adults').value;
        const rooms = document.getElementById('rooms').value;

        // Get the decrement buttons
        const decrementAdultsButton = document.getElementById('decrementAdults');
        const decrementRoomsButton = document.getElementById('decrementRooms');

        // Check if the buttons exist before trying to set their disabled state
        if (decrementAdultsButton && decrementRoomsButton) {
            decrementAdultsButton.disabled = adults == 1;
            decrementRoomsButton.disabled = rooms == 1;
        }
    }

    function validateForm() {
        const guestsInput = document.getElementById('guest');
        const guestsValue = guestsInput.value.trim();

        // Check if the guests input field is empty or has the default value
        if (guestsValue === '' || guestsValue === '0 Room, 0 Adults, 0 Children') {
            // Display the validation message in a specific element
            const validationMessageElement = document.getElementById('validationMessage');
            validationMessageElement.innerHTML = 'Please select the number of guests.';
            return false; // Prevent default form submission
        }

        // Extract the number of adults, children, and rooms from the guests input
        const match = guestsValue.match(/(\d+) Room(?:s)?, (\d+) Adults?, (\d+) Children?/);

        // Check if the match is successful and values are valid numbers
        if (!match || match.length !== 4 || match.slice(1).some(isNaN)) {
            const validationMessageElement = document.getElementById('validationMessage');
            validationMessageElement.innerHTML = 'Invalid guest input.';
            return false; // Prevent default form submission
        }

        const [, rooms, adults, children] = match;

        // Check if the number of adults is less than the number of rooms
        if (parseInt(adults, 10) < parseInt(rooms, 10)) {
            const validationMessageElement = document.getElementById('validationMessage');
            validationMessageElement.innerHTML = 'Select at least 1 adult per room.';
            setTimeout(function() {
                validationMessageElement.innerHTML = '';
            }, 4000); // 3000 milliseconds = 3 seconds
            return false; // Prevent default form submission
        }

        // Check if the total number of adults and children combined exceeds 5 per room
        const totalGuests = parseInt(adults, 10) + parseInt(children, 10);
        if (totalGuests > rooms * 4) {
            const validationMessageElement = document.getElementById('validationMessage');
            validationMessageElement.innerHTML = 'Maximum 4 persons (adults and children combined) are allowed per room.';
            // Set a timeout to clear the validation message after 3 seconds (adjust as needed)
            setTimeout(function() {
                validationMessageElement.innerHTML = '';
            }, 4000); // 3000 milliseconds = 3 seconds

            return false; // Prevent default form submission

        }




        // Clear the validation message if the validation passes
        const validationMessageElement = document.getElementById('validationMessage');
        validationMessageElement.innerHTML = '';

        const isValid = storeSelectedRoomDetails();

        return isValid; // Prevent default form submission
        return true;
    }

    // Function to store selected room details in local storage
    function storeSelectedRoomDetails() {
        const checkIn = document.getElementById('date-in').value;
        const checkOut = document.getElementById('date-out').value;
        const rooms = parseInt(document.getElementById('rooms').value, 10); // Convert to integer
        const adults = document.getElementById('adults').value;
        const children = document.getElementById('children').value;

        const selectedRoomDetails = {
            checkIn,
            checkOut,
            guests: {
                rooms,
                adults,
                children
            }
        };

        localStorage.setItem('selectedRoomDetails', JSON.stringify(selectedRoomDetails));

        return true;
    }


    // Function to store form details in local storage
    function storeFormDetails(checkIn, checkOut, guests) {
        const formDetails = {
            checkIn: checkIn,
            checkOut: checkOut,
            guests: guests
        };
        localStorage.setItem('formDetails', JSON.stringify(formDetails));
    }

    // Example: Call this function when the form is submitted
    function onFormSubmit() {
        console.log('Form submitted');
        const checkIn = document.getElementById('checkIn').value;
        const checkOut = document.getElementById('checkOut').value;
        const rooms = document.getElementById('rooms').value;
        const adults = document.getElementById('adults').value;
        const children = document.getElementById('children').value;

        const guests = {
            rooms: rooms,
            adults: adults,
            children: children
        };

        // Store the form details in localStorage
        storeFormDetails(checkIn, checkOut, guests);
    }