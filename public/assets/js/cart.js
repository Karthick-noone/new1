const roomTypeIndexMap = {
    'Premium Room': 1,
    'Deluxe Room': 2,
    'Double Room': 3,
    'Luxury Room': 4,
    'Single Room': 5,
    'Small Room': 6,
};
function onDoneClick(roomType, price, taxes, selectElement) {
    const selectedRoomCount = parseInt(selectElement.value, 10);
    const availableRoomElement = document.getElementById(roomType.replace(/\s+/g, '_') + "Count");
    const availableRoomCount = parseInt(availableRoomElement.textContent.match(/\d+/)[0], 10);

    // Use the roomTypeIndexMap to get the container index
    const errorMessageContainerId = 'errorMessageContainer' + roomTypeIndexMap[roomType];
    console.log("errorMessageContainerId:", errorMessageContainerId);

    const errorMessageElement = document.getElementById(errorMessageContainerId);

    console.log("Selected Room Count:", selectedRoomCount);
    console.log("Available Room Count:", availableRoomCount);


    // Clear the error message outside of the if conditions

    if (selectedRoomCount === 0) {
        if (availableRoomCount === 0) {
            // If selected room count exceeds available room count, update the error message
            errorMessageElement.innerHTML = `<span style="color:red;">Sorry, rooms are not available in the ${roomType}.</span>`;
            setTimeout(() => {
                errorMessageElement.innerHTML = '';
                availableRoomElement.innerHTML = `${availableRoomCount}`;
            }, 5000);
            return;
        }

        // Display an error message for zero selected rooms
        errorMessageElement.innerHTML = `<span style="color:red;">Please select at least one room.</span>`;
        setTimeout(() => {
            errorMessageElement.innerHTML = '';
            availableRoomElement.innerHTML = `${availableRoomCount}`;
        }, 3000);
        return;
    }

    if (availableRoomCount === 0) {
        // If selected room count exceeds available room count, update the error message
        errorMessageElement.innerHTML = `<span style="color:red;">Sorry, rooms are not available in the ${roomType}.</span>`;
        setTimeout(() => {
            errorMessageElement.innerHTML = '';
            availableRoomElement.innerHTML = `${availableRoomCount}`;
        }, 5000);
        return;
    }

    if (selectedRoomCount > availableRoomCount) {
        // If selected room count exceeds available room count, update the error message
        errorMessageElement.innerHTML = `Only <span style="color:red;">${availableRoomCount}</span> room${availableRoomCount === 1 ? '' : 's'} ${availableRoomCount === 1 ? 'is' : 'are'} available for ${roomType}.`;
        setTimeout(() => {
            errorMessageElement.innerHTML = '';
            availableRoomElement.innerHTML = `${availableRoomCount}`;
        }, 6000);
        return;
    }
    errorMessageElement.innerHTML = '';

    // Clear the error message if the selection is valid
    availableRoomElement.innerHTML = `${availableRoomCount}`;


    // Rest of your existing code for storing selected room details...


    // Convert taxes to a number (assuming taxes is a string)
    const taxesAsNumber = !isNaN(taxes) ? parseInt(taxes, 10) : taxes;

    // Store selected room details in local storage
    const roomDetails = {
        roomType: roomType,
        price: price,
        taxes: taxesAsNumber,
        numberOfRooms: selectedRoomCount
    };

    // Check if there are already selected rooms in local storage
    let selectedRooms = JSON.parse(localStorage.getItem('selectedRooms')) || [];

    // Check if there is already a room with the same type
    const existingRoomIndex = selectedRooms.findIndex(room => room.roomType === roomType);

    if (existingRoomIndex !== -1) {
        // If the room type already exists, update the number of rooms
        selectedRooms[existingRoomIndex].numberOfRooms = selectedRoomCount;
    } else {
        // If the room type doesn't exist, add the current room details to the array
        selectedRooms.push(roomDetails);
    }

    localStorage.setItem('selectedRooms', JSON.stringify(selectedRooms));

    // Display room type and number of rooms near the Reserve button
    displaySelectedRooms();
}

// Function to display selected rooms on the .php page
function displaySelectedRooms() {
    // Retrieve the selected room details from local storage
    const selectedRooms = JSON.parse(localStorage.getItem('selectedRooms'));

    // Display the details on the .php page
    const displayElement = document.getElementById('selectedRoomDisplay');
    const errorMessageElement = document.getElementById('errorMessage');

    // Clear previous content
    displayElement.innerHTML = '';
    errorMessageElement.innerHTML = ''; // Clear the error message

    if (selectedRooms && selectedRooms.length > 0) {
        // Create a table for displaying room details
        const table = document.createElement('table');
        table.classList.add('table', 'table-bordered');

        // Create table header
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        const headers = ['Room Type', 'No. of Rooms', 'Price', 'Cancel Room'];
        headers.forEach(headerText => {
            const th = document.createElement('th');
            th.textContent = headerText;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Create table body
        const tbody = document.createElement('tbody');
        totalPrice = 0; // Reset totalPrice

        selectedRooms.forEach(room => {
            const row = document.createElement('tr');

            // Room Type
            const roomTypeCell = document.createElement('td');
            roomTypeCell.textContent = room.roomType;
            row.appendChild(roomTypeCell);

            // No. of Rooms
            const numberOfRoomsCell = document.createElement('td');
            numberOfRoomsCell.textContent = room.numberOfRooms;
            row.appendChild(numberOfRoomsCell);

            // Price (assuming you have a property named 'price' in your room object)
            const priceCell = document.createElement('td');
            const roomPrice = room.price * room.numberOfRooms ;
            totalPrice += roomPrice;
            priceCell.textContent = `Rs. ${roomPrice.toFixed(0)}`;
            row.appendChild(priceCell);
            

            // Cancel Button
            const cancelCell = document.createElement('td');
            const cancelButton = document.createElement('button');
            cancelButton.classList.add('btn', 'btn-danger');
            cancelButton.textContent = 'Cancel';
            cancelButton.onclick = function () {
                deleteRoom(room.roomType);
            };
            cancelCell.appendChild(cancelButton);
            row.appendChild(cancelCell);

            tbody.appendChild(row);
        });

        table.appendChild(tbody);
       // Display the total price including tax in the right corner
       const totalRow = document.createElement('tr');
       const totalCell = document.createElement('td');
       totalCell.setAttribute('colspan', '4'); // Colspan should match the number of columns in your table
       totalCell.style.textAlign = 'right'; // Align content to the right
       totalCell.style.fontSize = '18px';
       // Calculate total price including tax
       const totalPriceWithTax = totalPrice + selectedRooms.length * 120; // Assuming tax is 120 per room
       
       totalCell.textContent = `Total Price (incl. tax): Rs. ${totalPriceWithTax.toFixed(0)}`;
       totalRow.appendChild(totalCell);
       tbody.appendChild(totalRow);
        displayElement.appendChild(table);
    } else {
        // Display an error message if no rooms are selected
        errorMessageElement.innerHTML = 'No rooms selected. Please go back to select rooms.';
    }

    window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    updateCartCount();

}

// Function to delete a room from local storage
function deleteRoom(roomType) {
    let selectedRooms = JSON.parse(localStorage.getItem('selectedRooms')) || [];

    // Find the index of the room with the specified roomType
    const roomIndex = selectedRooms.findIndex(room => room.roomType === roomType);

    if (roomIndex !== -1) {
        // Remove the room from the array
        selectedRooms.splice(roomIndex, 1);

        // Update the local storage
        localStorage.setItem('selectedRooms', JSON.stringify(selectedRooms));

        // Update the display
        displaySelectedRooms();
    }
}

// Call displaySelectedRooms when the page loads
document.addEventListener('DOMContentLoaded', function() {
    // Check if the page is reloaded
    if (performance.navigation.type === 1) {
        // If the page is reloaded, clear selected rooms from local storage
        
    }

    displaySelectedRooms();
});

document.addEventListener('DOMContentLoaded', function() {
    const reserveButton = document.getElementById('reserveButton');
    reserveButton.addEventListener('click', onReserveButtonClick);
    displaySelectedRooms();
});

function onReserveButtonClick(event) {
    
    event.preventDefault();  // Prevent the default form submission behavior

    console.log('Attempting to reserve room...');

    // Retrieve the selected room details from local storage
    const selectedRooms = JSON.parse(localStorage.getItem('selectedRooms'));
    console.log('Selected Rooms:', selectedRooms);

    // Retrieve the selected room details from the initial selection
    const selectedRoomDetails = JSON.parse(localStorage.getItem('selectedRoomDetails'));

    // Check if there are selected room details
    if (selectedRoomDetails) {
        // Access individual details
        const storedRoomCount = parseInt(selectedRoomDetails.guests.rooms, 10);

        // If there are selected room details, compare the counts
        if (selectedRooms && selectedRooms.length > 0) {
            const totalSelectedRooms = selectedRooms.reduce((total, room) => total + room.numberOfRooms, 0);

            if (totalSelectedRooms === storedRoomCount) {
                // Counts match, proceed with the reservation
                const params = selectedRooms.map(room => {
                    return `roomType=${room.roomType}&price=${room.price}&numberOfRooms=${room.numberOfRooms}&taxes=${room.taxes}`;
                }).join('&');

                console.log('Redirecting to booking.php with parameters:', params);

                // Try using window.location.replace instead
                window.location.href = `booking.php?${params}`;

                // Add any additional logic here if needed

            } else {
                // Display an error message with the selected room count
                const errorMessageElement = document.getElementById('errorMessage');
                errorMessageElement.innerHTML = `Please select the correct number of rooms to proceed with the reservation. You previously selected ${storedRoomCount} room${storedRoomCount == 1 ? '' : 's'}.`;

                setTimeout(() => {
                    errorMessageElement.innerHTML = '';
                }, 10000);
            }
        } else {
            // No selected room details, show an alert or handle accordingly
            alert("Please select rooms for reservation.");
        }
    } 
    console.log('Reservation attempt completed.');
}

function sendRoomDetailsToUpdateRooms() {
    // Retrieve the selected room details from local storage
    const selectedRooms = JSON.parse(localStorage.getItem('selectedRooms'));

    // Check if there are selected room details
    if (selectedRooms && selectedRooms.length > 0) {
        // Prepare the data to be sent to update_rooms.php
        const data = {
            roomDetails: selectedRooms,
        };

        // Send the data to update_rooms.php using fetch
        fetch('update_rooms.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
            })
            .then(response => response.text())
            .then(data => {
                console.log(data); // You can handle the server response here
            })
            .catch((error) => {
                console.error('Error sending request to update_rooms.php:', error);
            });
    } else {
        console.log('No selected room details available to update.');
    }
}


  // Function to fetch and update available rooms count
  function updateAvailableRoomsCount() {
    // Make an AJAX request to fetch available rooms count
    var xhr = new XMLHttpRequest();

    xhr.onreadystatechange = function() {
        if (xhr.readyState == 4) {
            console.log("XHR Ready State:", xhr.readyState);

            if (xhr.status == 200) {
                try {
                    // Parse the JSON response
                    var response = JSON.parse(xhr.responseText);

                    // Check if the response structure is as expected
                    if (response.success && response.availableRooms) {
                        // Update the available rooms count in the HTML for each room type
                        for (var roomType in response.availableRooms) {
                            if (response.availableRooms.hasOwnProperty(roomType)) {
                                // Log for further debugging
                                console.log("Room Type:", roomType, "Count:", response.availableRooms[roomType]);

                                // Replace spaces with underscores in roomType
                                var formattedRoomType = roomType.replace(/\s+/g, '_');

                                // Assuming you have an element with the ID corresponding to the room type
                                var roomCountElement = document.getElementById(formattedRoomType + "Count");

                                if (roomCountElement) {
                                    // Use textContent to set the text
                                    roomCountElement.textContent = " " + response.availableRooms[roomType] + " ";
                                }
                            }
                        }
                    } else {
                        console.error("Invalid response structure.");
                    }
                } catch (error) {
                    console.error("Error parsing JSON:", error);
                }
            } else {
                console.error("Error fetching data. Status code: " + xhr.status);
            }
        }
    };

    // Specify the URL of the server-side script to fetch available rooms count
    xhr.open("GET", "http://localhost/fabrorooms/booking/admin/update_availability.php", true);
    xhr.send();
}

// Call the function to update available rooms count when the DOM is fully loaded
document.addEventListener("DOMContentLoaded", function() {
    updateAvailableRoomsCount();
}); 

// Function to update the cart count badge
function updateCartCount() {
    const selectedRooms = JSON.parse(localStorage.getItem('selectedRooms')) || [];
    const cartCountBadge = document.getElementById('cartCountBadge');

    // Calculate the total number of selected rooms
    const totalRooms = selectedRooms.reduce((total, room) => total + room.numberOfRooms, 0);

    // Update the cart count badge
    cartCountBadge.textContent = totalRooms.toString();
}


// Call the updateCartCount function when the page loads
document.addEventListener('DOMContentLoaded', function() {
    updateCartCount();
});