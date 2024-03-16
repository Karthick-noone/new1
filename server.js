const express = require("express");
const cors = require("cors");
const pool = require("./db.js"); // Import the common database connection
const app = express();
// const { DateTime } = require("luxon");
const axios = require("axios");
const bodyParser = require("body-parser");
// const session = require("express-session"); // Add this line for session management
const multer = require("multer");
const fs = require("fs");
// const admin = require("firebase-admin");
const path = require("path");
const nodemailer = require('nodemailer');
// const dotenv = require('dotenv'); // Import dotenv to read environment variables
// const twilio = require('twilio');
require('dotenv').config(); // Load environment variables from .env file
// Define otpVerificationRouter before using it
const port = process.env.PORT || 3005;

app.use(cors());


// // Establish database connection
// pool.getConnection((err, connection) => {
//   if (err) {
//     console.error('Failed to connect to the database:', err);
//   } else {
//     console.log('Connected to the database');
//     // Release the connection
//     connection.release();
//   }
// });

const fast2sms = require('fast-two-sms')

app.post('/cancelbooking', async (req, res) => {
  try {
    const { bookingId, cancellation } = req.body;
    
    // Insert a new record into the 'cancellations' table
    const result = await pool.query('INSERT INTO cancellations (booking_id, cancellation) VALUES (?, ?)', [bookingId, cancellation]);
    
    console.log(`Cancellation record inserted for booking ID ${bookingId} with status: ${cancellation}`);
    
    // Send a success response to the client
    res.status(200).send('Room booking cancelled successfully');
  } catch (error) {
    // Log the error and send an error response to the client
    console.error('Failed to cancel room booking:', error);
    res.status(500).send('Failed to cancel room booking');
  }
});

//https://dashboard.nexmo.com/getting-started/sms
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
// Generate a random 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000);
};

// Store OTPs and their corresponding phone numbers
const otpMap = new Map();
app.post('/sendotp', async (req, res) => {
  try {
    const { number } = req.body;
    
    // Check if the provided mobile number exists in the 'bookings' table
    const [existingBooking] = await pool.query('SELECT * FROM bookings WHERE number = ?', [number]);
    
    if (!existingBooking || existingBooking.length === 0) {
      // If the number is not found in the database, send an error message to the client
      console.log(`Mobile number ${number} does not exist in the bookings table.`);
      const errorMessage = 'This number is not associated with any bookings.';
      console.log(`Sending response to client: ${errorMessage}`);
      return res.status(400).send(errorMessage);
    }

    // Generate OTP
    const otp = generateOTP();

    // Store OTP in the database
    await pool.query('UPDATE bookings SET otp = ? WHERE number = ?', [otp, number]);
    console.log(`OTP ${otp} stored in the database for mobile number ${number}.`);
    
    // Send OTP to the provided number
    const response = await axios.get(
      `http://login.smsgatewayhub.com/api/mt/SendSMS?user=Seasensesoftwares&password=Stripl@1&senderid=SEASEN&channel=Trans&DCS=0&flashsms=0&number=${number}&text=Dear ${otp}, Many more happy returns of the day. With regards Sea Sense Group.&route=47&DLTTemplateId=1707161044624969443&PEID=1701159125640974053`
    );
    
    console.log(`OTP ${otp} sent to ${number} successfully.`);
    res.status(200).send('OTP sent successfully');
    console.log(`Response sent to client: OTP sent successfully`);
  } catch (error) {
    console.error(error);
    res.status(500).send('Failed to send OTP');
    console.log(`Response sent to client: Failed to send OTP`);
  }
});


app.post('/verifyotp', async (req, res) => {
  try {
    const { number, otp } = req.body;

    // Retrieve all matching rows from the database in descending order of timestamp
    const [matchingBookings] = await pool.query('SELECT * FROM bookings WHERE number = ? ORDER BY id DESC', [number]);
    
    // Check if there are any matching rows
    if (matchingBookings && matchingBookings.length > 0) {
      // Check if the provided OTP matches any of the stored OTPs
      const matchedBookings = matchingBookings.filter(booking => booking.otp === otp);

      if (matchedBookings.length > 0) {
        // If OTP is verified successfully, delete it from the map
        otpMap.delete(number);
        
        // Log room details
        console.log('Room details:', matchedBookings);
        
        res.status(200).send(matchedBookings); // Send the matched row details as response
      } else {
        res.status(400).send('Invalid OTP');
      }
    } else {
      res.status(400).send('No matching records for the provided number');
    }
  } catch (error) {
    console.error('Failed to verify OTP:', error);
    res.status(500).send('Failed to verify OTP');
  }
});

// Update the status of a room
app.put('/api/updateStatus', async (req, res) => {
  try {
    // Extract isActive and roomId from the request body
    const { isActive, roomId } = req.body;

    // Update the status of rooms in the database
    await pool.query('UPDATE rooms SET status = ? WHERE id = ?', [isActive, roomId]);

    // Send a success response to the client
    res.status(200).json({ message: 'Status updated successfully' });
  } catch (error) {
    // Log the error and send an error response to the client
    console.error('Failed to update status:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// Fetch the status of the switch for all room types
app.get('/api/getStatuss', async (req, res) => {
  try {
    // Fetch the status for all room types from your database
    // Replace this query with your actual query to fetch the status from your database
    const [statusRows] = await pool.query('SELECT room_type, status FROM rooms');

    // Create an object to store the status for each room type
    const statusByRoomType = {};

    // Iterate through the query result and store the status for each room type
    statusRows.forEach(row => {
      const { room_type, status } = row; // Adjusted to use room_type
      if (room_type) {
        statusByRoomType[room_type] = status;
      } else {
        console.error('Invalid roomType:', row);
      }
    });

    // Log the fetched status
    console.log('Fetched room status:', statusByRoomType);

    // Send the status for each room type as a response
    res.status(200).json(statusByRoomType);
  } catch (error) {
    // Log the error and send an error response to the client
    console.error('Failed to fetch status:', error);
    res.status(500).json({ error: 'Failed to fetch status' });
  }
});


// Fetch the status of the switch for a specific room
app.get('/api/getStatus/:roomId', async (req, res) => {
  try {
    // Extract the room ID from the request parameters
    const { roomId } = req.params;

    // Log the room ID received in the request
    console.log('Received request for room ID:', roomId);

    // Fetch the status from your database based on the room ID
    // Replace this query with your actual query to fetch the status from your database
    const [statusRows] = await pool.query('SELECT status FROM rooms WHERE id = ?', [roomId]);

    // Check if the status is found for the given room ID
    if (statusRows.length === 0) {
      // Log if the status is not found
      console.log('Status not found for room ID:', roomId);
      return res.status(404).json({ error: 'Status not found for the provided room ID' });
    }

    // Extract the status value from the query result
    const { status } = statusRows[0];

    // Log the extracted status value
    console.log('Status value:', status);

    // Send the status as a response
    res.status(200).json({ status });
  } catch (error) {
    // Log the error and send an error response to the client
    console.error('Failed to fetch status:', error);
    res.status(500).json({ error: 'Failed to fetch status' });
  }
});

// Add a new route to fetch room details
app.get('/roomdetails/:number', async (req, res) => {
  try {
    const { number } = req.params;

    // Fetch room details associated with the verified number from the database
    const [roomDetails] = await pool.query('SELECT * FROM bookings WHERE number = ?', [number]);
    
    // Log the fetched room details
    console.log(`Room details fetched successfully for number ${number}:`, roomDetails);

    res.json(roomDetails); // Send room details as JSON response
  } catch (error) {
    console.error('Failed to fetch room details:', error);
    res.status(500).send('Failed to fetch room details');
  }
});

app.post('/sendmessage', (req, res) => {
  const { number } = req.body;
  sendMessage(number, res);
});
//http://login.smsgatewayhub.com/api/mt/SendSMS?user=Seasensesoftwares&password=Stripl@1&senderid=SEASEN&channel=Trans&DCS=0&flashsms=0&number=9489318959&text=Dear 78745, Many more happy returns of the day. With regards Sea Sense Group.&route=47&DLTTemplateId=1707161044624969443&PEID=1701159125640974053
function sendMessage(number, res) {
  const options = {
    authorization: "fvTSICR1FhGHDt5X36Eur00MF5TFEtrZt0VMo6VCD2WOdRFPbjqb2XcqjKmS",
    message: 'hello',
    numbers: [number]
  };

  fast2sms.sendMessage(options)
    .then((response) => {
      if (response.return === true) {
        console.log(`OTP sent successfully: ${response.sms.message}`);
      }
      res.send('SMS OTP sent successfully');
      console.log(response);
    })
    .catch((error) => {
      res.status(500).send('Error occurred while sending OTP');
      console.error(error);
    });
}


const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: process.env.EMAIL_ADDRESS,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Middleware
app.use(express.json());

// Route to send email
app.post('/send-email', (req, res) => {
  const { name, number, email, subject, message } = req.body;

  const mailOptions = {
    from: email,
    to: process.env.DESTINATION_EMAIL,
    subject: subject,
    text: `
      Name: ${name}
      Number: ${number}
      Email: ${email}
      Message: ${message}
    `
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Error sending email:', error);
      res.status(500).json({ error: 'Failed to send email', details: error.message });
    } else {
      console.log('Email sent:', info.response);
      res.status(200).json({ message: 'Email sent successfully' });
    }
  });
});


app.use("/uploads", express.static("uploads"));
app.use(express.json());
app.use(cors());

// const accountSid = process.env.TWILIO_ACCOUNT_SID;
// const authToken = process.env.TWILIO_AUTH_TOKEN;
// const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

// const client = twilio(accountSid, authToken);

// app.post('/send-otp', async (req, res) => {
//     const { phoneNumber } = req.body;
//     if (!phoneNumber) {
//         return res.status(400).json({ error: 'Phone number is required' });
//     }

//     const otp = generateOTP();
//     try {
//         await client.messages.create({
//             body: `Your OTP is ${otp}`,
//             from: twilioPhoneNumber,
//             to: phoneNumber
//         });
//         res.status(200).json({ success: true, otp });
//     } catch (error) {
//         console.error('Error sending OTP:', error);
//         res.status(500).json({ error: 'Error sending OTP' });
//     }
// });

// app.post('/verify-otp', (req, res) => {
//   const { otp } = req.body;
//   // Here you would implement your logic to verify the OTP
//   // For now, let's assume OTP verification is successful if the OTP matches the one received from the client
//   if (otp === req.body.otp) {
//       res.status(200).json({ success: true });
//   } else {
//       res.status(400).json({ error: 'Invalid OTP' });
//   }
// });

// function generateOTP() {
//     return Math.floor(100000 + Math.random() * 900000);
// }





// // Add session management middleware
// app.use(
//   session({
//     secret: "your-secret-key",
//     resave: false,
//     saveUninitialized: true,
//   })
// );

//RoomsCoverImages 

const coverImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const destinationFolder = './uploads/coverimages';
    fs.mkdirSync(destinationFolder, { recursive: true });
    cb(null, destinationFolder);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  },
});

const coverImageUpload = multer({ storage: coverImageStorage });

app.post("/uploadCoverImage", coverImageUpload.single("image"), async (req, res) => {
  try {
    const imageUrl = `/uploads/coverimages/${req.file.filename}`;
    const roomType = req.body.roomType; // Retrieve room type from the request body

    // Insert imageUrl and roomType into the database
    const [result, fields] = await pool.query(
      "INSERT INTO roomgallerycoverimages (image_url, room_type) VALUES (?, ?)",
      [imageUrl, roomType]
    );

    res.json({ success: true, message: "Cover image uploaded successfully" });
  } catch (error) {
    console.error("Error uploading cover image:", error);
    res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
});

app.put("/updateCoverImage/:imageName", coverImageUpload.single("image"), async (req, res) => {
  const { imageName } = req.params;

  try {
    // Ensure that a file was uploaded
    if (!req.file) {
      return res.status(400).json({ error: "No image file uploaded" });
    }

    // Construct the new relative image URL
    const updatedImageUrl = `/uploads/coverimages/${req.file.filename}`;

    // Update the image URL in the database
    const query = "UPDATE roomgallerycoverimages SET image_url = ? WHERE image_url = ?";
    const [result] = await pool.query(query, [updatedImageUrl, `/uploads/coverimages/${imageName}`]);

    if (result.affectedRows > 0) {
      // Delete the existing image file
      const existingImagePath = `./uploads/coverimages/${imageName}`;
      fs.unlink(existingImagePath, (unlinkErr) => {
        if (unlinkErr) {
          console.error("Error deleting existing image:", unlinkErr);
        } else {
          console.log("Existing image deleted successfully:", existingImagePath);
        }
      });

      // Send a success response to the client
      res.status(200).json({ success: true, message: "Cover image updated successfully" });
    } else {
      // If no rows were affected, return a 404 error
      res.status(404).json({ error: "Cover image not found" });
    }
  } catch (error) {
    console.error("Error updating cover image:", error);
    res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
});

// API Route
app.delete("/api/deleteCoverImage", async (req, res) => {
  try {
    const { imageUrl } = req.query;

    // Check if imageUrl is provided
    if (!imageUrl) {
      console.error("Image URL is required");
      return res.status(400).json({ error: "Image URL is required" });
    }

    // Log the received imageUrl
    console.log("Received request to delete cover image:", imageUrl);

    // Delete the image from the database
    const [result, fields] = await pool.query(
      "DELETE FROM roomgallerycoverimages WHERE image_url = ?",
      [imageUrl]
    );

    // Check if image was found and deleted from the database
    if (result.affectedRows === 0) {
      console.error("Cover image not found in the database");
      return res
        .status(404)
        .json({ error: "Cover image not found in the database" });
    }

    // Construct absolute path to image file
    const imagePath = path.join(__dirname, imageUrl);

    // Check if the image file exists before attempting deletion
    if (fs.existsSync(imagePath)) {
      // Delete the image file from the storage folder
      fs.unlink(imagePath, (err) => {
        if (err) {
          console.error("Error deleting image file:", err);
          return res
            .status(500)
            .json({ error: "Internal Server Error", details: err.message });
        }
        console.log("Cover image file deleted successfully:", imagePath);
        res
          .status(200)
          .json({ success: true, message: "Cover image deleted successfully" });
      });
    } else {
      console.error("Cover image file not found:", imagePath);
      res.status(404).json({ error: "Cover image file not found" });
    }
  } catch (error) {
    console.error("Error deleting cover image:", error);
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
});

app.get("/api/roomgallerycoverimages", async (req, res) => {
  try {
    // Fetch cover images from the database
    const [rows, fields] = await pool.query("SELECT * FROM roomgallerycoverimages");
    console.log("Fetched rows:", rows); // Log fetched rows
    
    // Extract image URLs and room types from the rows
    const imageData = rows.map((row) => ({ imageUrl: row.image_url, roomType: row.room_type }));
    console.log("Image Data:", imageData); // Log image data
    
    res.json(imageData);
  } catch (error) {
    console.error("Error fetching cover images:", error);
    res.status(500).json({ error: "Internal Server Error", details: error.message });
  }
});



// Middleware to check authentication
const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) {
    return next();
  } else {
    res.redirect("Admin/Login");
  }
};

// Define storage for multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const roomType = req.query.roomType; // Use a default value if not provided
    console.log("roomType", roomType);
    const destinationFolder = `./uploads/${roomType}`;
    fs.mkdirSync(destinationFolder, { recursive: true });
    cb(null, destinationFolder);
  },
  filename: (req, file, cb) => {
    const destinationPath = `./uploads/${req.query.roomType}/${file.originalname}`;
    console.log("Saving file to:", destinationPath);
    cb(null, file.originalname);
  },
});

// Use multer with the defined storage
const upload = multer({ storage: storage });

// Handle image upload
app.post("/upload", upload.single("image"), async (req, res) => {
  try {
    const roomType = req.query.roomType || "default"; // Use a default value if not provided
    const imageUrl = `/uploads/${roomType}/${req.file.filename}`;

    // Insert imageUrl into the corresponding database table based on room type
    const [result, fields] = await pool.query(
      `INSERT INTO ${roomType.toLowerCase()}images (image_url) VALUES (?)`,
      [imageUrl]
    );

    res.json({ success: true, message: "Image uploaded successfully" });
  } catch (error) {
    console.error("Error uploading image:", error);
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
});

app.get("/api/roomimages", async (req, res) => {
  try {
    const { roomType } = req.query;

    if (!roomType) {
      return res.status(400).json({ error: "Room type is required" });
    }

    // Sanitize roomType to prevent SQL injection
    const sanitizedRoomType = roomType.toLowerCase().replace(/[^a-z0-9_]/g, "");
    const query = `SELECT image_url FROM ${sanitizedRoomType}roomimages`;

    const [rows, fields] = await pool.query(query);
    const imageUrls = rows.map((row) => row.image_url);
    res.json(imageUrls);
  } catch (error) {
    console.error(`Error fetching ${req.query.roomType} room images:`, error);
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
});

app.put(
  "/uploads/:roomType/:imageName",
  upload.single("image"),
  async (req, res) => {
    const { roomType, imageName } = req.params;

    try {
      // Construct the new relative image URL
      const updatedImageUrl = `/uploads/${roomType}/${req.file.filename}`;

      // Save the new image
      const newImagePath = `./uploads/${roomType}/${req.file.filename}`;
      fs.rename(req.file.path, newImagePath, async (err) => {
        if (err) {
          console.error("Server - Error updating image file:", err);
          res
            .status(500)
            .json({ error: "Internal Server Error", details: err.message });
        } else {
          console.log(
            "Server - Image file updated successfully to:",
            newImagePath
          );

          // Update the image URL in the database
          const query = `UPDATE ${roomType.toLowerCase()}images SET image_url = ? WHERE image_url = ?`;
          const [result, fields] = await pool.query(query, [
            updatedImageUrl,
            `/uploads/${roomType}/${imageName}`,
          ]);

          if (result.affectedRows > 0) {
            // Log success message
            console.log("Image updated successfully in the database.");

            // Delete the existing image
            const existingImagePath = `./uploads/${roomType}/${imageName}`;
            fs.unlink(existingImagePath, (unlinkErr) => {
              if (unlinkErr) {
                console.error(
                  "Server - Error deleting existing image:",
                  unlinkErr
                );
              } else {
                console.log(
                  "Server - Existing image deleted successfully:",
                  existingImagePath
                );
              }
            });

            // Send a success response to the client
            res
              .status(200)
              .json({ success: true, message: "Image updated successfully" });
          } else {
            // If no rows were affected, return a 404 error
            res.status(404).json({ error: "Image not found" });
          }
        }
      });
    } catch (error) {
      console.error("Server - Error updating image:", error);
      res
        .status(500)
        .json({ error: "Internal Server Error", details: error.message });
    }
  }
);

app.delete("/api/deleteImage", async (req, res) => {
  try {
    const { imageUrl, roomType } = req.query;

    // Check if imageUrl and roomType are provided
    if (!imageUrl || !roomType) {
      console.error("Image URL and room type are required");
      return res
        .status(400)
        .json({ error: "Image URL and room type are required" });
    }

    // Log the received imageUrl and roomType
    console.log(
      "Received request to delete image:",
      imageUrl,
      "for room type:",
      roomType
    );

    // Construct the table name based on the roomType
    const tableName = `${roomType.toLowerCase()}roomimages`;

    // Delete the image from the database
    const [result, fields] = await pool.query(
      `DELETE FROM ${tableName} WHERE image_url = ?`,
      [imageUrl]
    );

    // Check if image was found and deleted from the database
    if (result.affectedRows === 0) {
      console.error("Image not found in the database");
      return res.status(404).json({ error: "Image not found in the database" });
    }

    // Construct absolute path to image file
    // Construct absolute path to image file
    const imagePath = path.join(__dirname, imageUrl);

    // Check if the image file exists before attempting deletion
    if (fs.existsSync(imagePath)) {
      // Delete the image file from the storage folder
      fs.unlink(imagePath, (err) => {
        if (err) {
          console.error("Error deleting image file:", err);
          return res
            .status(500)
            .json({ error: "Internal Server Error", details: err.message });
        }
        console.log("Image file deleted successfully:", imagePath);
        res
          .status(200)
          .json({ success: true, message: "Image deleted successfully" });
      });
    } else {
      console.error("Image file not found:", imagePath);
      res.status(404).json({ error: "Image file not found" });
    }
  } catch (error) {
    console.error("Error deleting image:", error);
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
});

const homepageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const destinationFolder = `./uploads/homepage`;
    fs.mkdirSync(destinationFolder, { recursive: true });
    cb(null, destinationFolder);
  },
  filename: (req, file, cb) => {
    const destinationPath = `./uploads/homepage/${file.originalname}`;
    console.log("Saving file to:", destinationPath);
    cb(null, file.originalname);
  },
});

const homepageUpload = multer({ storage: homepageStorage });

// Handle homepage image upload
app.post(
  "/upload/homepage",
  homepageUpload.single("image"),
  async (req, res) => {
    try {
      const imageUrl = `/uploads/homepage/${req.file.filename}`;

      // Insert imageUrl into the homepage database table
      const [result, fields] = await pool.query(
        "INSERT INTO homepageimages (image_url) VALUES (?)",
        [imageUrl]
      );

      res.json({
        success: true,
        message: "Homepage image uploaded successfully",
      });
    } catch (error) {
      console.error("Error uploading homepage image:", error);
      res
        .status(500)
        .json({ error: "Internal Server Error", details: error.message });
    }
  }
);

// Retrieve homepage images
app.get("/api/homepageimages", async (req, res) => {
  try {
    const query = "SELECT image_url FROM homepageimages";
    const [rows, fields] = await pool.query(query);
    const imageUrls = rows.map((row) => row.image_url);
    res.json(imageUrls);
  } catch (error) {
    console.error("Error fetching homepage images:", error);
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
});

// Sample login route
app.post("/login", (req, res) => {
  // Authenticate user and create a session
  req.session.user = { username: "exampleUser" };
  res.send("Login successful!");
});
// Logout route
app.post("/logout", (req, res) => {
  // Destroy the session on logout
  req.session.destroy((err) => {
    if (err) {
      console.error(err);
    }
    res.send("Logout successful!");
  });
});

// Protected route example
app.get("/protected", requireAuth, (req, res) => {
  res.send("This is a protected page!");
});

app.get("/api/roomCounts", async (req, res) => {
  try {
    const [rows, fields] = await pool.query(
      "SELECT SUM(no_of_rooms) AS totalRooms FROM rooms"
    );
    const totalRooms = rows[0].totalRooms || 0;
    res.json({ totalRooms });
  } catch (error) {
    console.error("MySQL query error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/api/roomLimits", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, no_of_rooms FROM rooms"
    );

    const roomLimits = {};
    rows.forEach((row) => {
      roomLimits[row.id] = row.no_of_rooms;
    });

    res.json({ roomLimits });
  } catch (error) {
    console.error("Error fetching room limits:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});
// Import necessary modules and set up your server

// Assuming you have pool initialized for your database connection

// Function to get room details from the database
const getRoomDetails = async (roomType) => {
  const query =
    "SELECT currently_available, length_of_stay, last_updated FROM rooms WHERE room_type = ?";
  const [results, fields] = await pool.query(query, [roomType]);
  return results[0];
};



app.put("/api/cancel/:bookingId/cancel", async (req, res) => {
  const bookingId = req.params.bookingId;

  try {
    if (!bookingId) {
      throw new Error("Invalid or missing booking ID in the request.");
    }

    await pool.query("START TRANSACTION");

    const cancelQuery = `
      UPDATE bookings
      SET cancellation = 'cancelled'
      WHERE id = ?;
    `;

    await pool.query(cancelQuery, [bookingId]);

    await pool.query("COMMIT");

    console.log("Booking cancelled successfully");
    res.status(200).json({ message: "Booking cancelled successfully" });
  } catch (error) {
    await pool.query("ROLLBACK");

    console.error("Error cancelling booking:", error.message);
    res.status(500).json({
      error: "Internal Server Error",
      details: error.message || "Unknown error occurred on the server.",
    });
  }
});

app.get("/api/cancelledRoomCounts", async (req, res) => {
  try {
    const cancelledRoomCountsQuery = `
      SELECT COUNT(*) AS cancelledRoomCounts FROM bookings WHERE cancellation = 'cancelled';
    `;

    const [cancelledRoomCountsResult] = await pool.query(cancelledRoomCountsQuery);
    const cancelledRoomCounts = cancelledRoomCountsResult[0].cancelledRoomCounts;

    console.log("Cancelled room counts fetched successfully");
    res.status(200).json({ cancelledRoomCounts });
  } catch (error) {
    console.error("Error fetching cancelled room counts:", error.message);
    res.status(500).json({
      error: "Internal Server Error",
      details: error.message || "Unknown error occurred on the server.",
    });
  }
});

app.get("/api/cancelledRoomDetails", async (req, res) => {
  try {
    const cancelledRoomDetailsQuery = `
      SELECT * FROM bookings
      WHERE cancellation = 'cancelled'
      ORDER BY id DESC;
    `;

    const [cancelledRoomDetails] = await pool.query(cancelledRoomDetailsQuery);

    console.log("Cancelled room details fetched successfully");
    res.status(200).json(cancelledRoomDetails);
  } catch (error) {
    console.error("Error fetching cancelled room details:", error.message);
    res.status(500).json({
      error: "Internal Server Error",
      details: error.message || "Unknown error occurred on the server.",
    });
  }
});

app.get('/api/booking/:id/cancellationStatus', async (req, res) => {
  const bookingId = req.params.id;

  try {
    // Query the database to get the cancellation status for the specified booking ID
    const queryResult = await pool.query('SELECT cancellation FROM bookings WHERE id = ?', [bookingId]);
    
    // Check if rows were returned
    if (!queryResult || queryResult.length === 0) {
      // If no rows found, return cancellation status as null
      console.log(`No cancellation status found for booking ID ${bookingId}`);
      res.json({ cancellation: null });
    } else {
      // Extract the cancellation status from the query result
      const cancellationStatus = queryResult[0].cancellation;
      console.log(`Cancellation status for booking ID ${bookingId}: ${cancellationStatus}`);
      res.json({ cancellation: cancellationStatus });
    }
  } catch (error) {
    console.error('Error fetching cancellation status:', error);
    res.status(500).json({ error: 'An error occurred while fetching cancellation status' });
  }
});
// app.get('/api/booking/:id/cancellationStatus', async (req, res) => {
//   const bookingId = req.params.id;

//   try {
//     // Query the database to get the cancellation status for the specified booking ID
//     const queryResult = await pool.query('SELECT cancellation FROM bookings WHERE number = ?', [bookingId]);
    
//     // Check if rows were returned
//     if (!queryResult.rows || queryResult.rows.length === 0) {
//       // If no rows found, return cancellation status as null
//       res.json({ cancellation: null });
//     } else {
//       // Extract the cancellation status from the query result
//       const cancellationStatus = queryResult.rows[0].cancellation;
//       res.json({ cancellation: cancellationStatus });
//     }
//   } catch (error) {
//     console.error('Error fetching cancellation status:', error);
//     res.status(500).json({ error: 'An error occurred while fetching cancellation status' });
//   }
// });

app.post("/api/bookings", async (req, res) => {
  console.log("Received request body:", req.body);

  const {
    name,
    number,
    booking_for,
    travel_for_work,
    room_type,
    check_in,
    check_out,
    rooms,
    adults,
    children,
    price,
    length_of_stay,
    total_amount,
  } = req.body;

  try {
    if (!name || !number || !check_in || !check_out) {
      throw new Error(
        "Invalid or missing data in the request. Please provide all required fields."
      );
    }

    await pool.query("START TRANSACTION");

    const roomTypeArray = room_type.map(
      (room) => `${room.roomType} - ${room.roomCount}`
    );
    const roomTypeValues = roomTypeArray.join(", ");

    const insertQuery = `
      INSERT INTO bookings
      (name, number, booking_for, travel_for_work, room_type, check_in, check_out, rooms, adults, children, price, length_of_stay, total_amount, paid_amount, payment_status, balance_amount, booking_date, cancellation, otp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    // Set cancellation field to an initial value, for example 'none'

    const bookingDate = new Date().toDateString(); // Format: Sun Jan 07 2024

    await pool.query(insertQuery, [
      name,
      number,
      booking_for,
      travel_for_work,
      roomTypeValues,
      check_in,
      check_out,
      rooms,
      adults,
      children,
      price,
      length_of_stay,
      total_amount,
      0, // Setting paid_amount to 0 initially
      'pending',
      total_amount, // Setting balance_amount to total_amount initially
      bookingDate,
      '', // Provide a value for the cancellation field
      '' // Set initial value for otp
    ]);

    await pool.query("COMMIT");

    console.log("Booking submitted successfully");

    res.status(200).json({ message: "Booking submitted successfully" });
  } catch (error) {
    console.error("Error submitting booking:", error);
    await pool.query("ROLLBACK");
    res.status(500).json({ error: "Failed to submit booking" });
  }
});
// code 2
app.post("/api/booking", async (req, res) => {
  console.log("Received request body:", req.body);

  const {
    name,
    number,
    booking_for,
    travel_for_work,
    room_type,
    check_in,
    check_out,
    adults,
    rooms,
    children,
    price,
    length_of_stay,
    total_amount,
    paid_amount,
  } = req.body;

  try {
    if (!name || !number || !check_in || !check_out) {
      throw new Error(
        "Invalid or missing data in the request. Please provide all required fields."
      );
    }


    await pool.query("START TRANSACTION");

    const balanceAmount = total_amount - paid_amount;

    const insertQuery = `
    INSERT INTO bookings
    (name, number, booking_for, travel_for_work, room_type, check_in, check_out, adults, rooms, children, price, length_of_stay, total_amount, paid_amount, balance_amount, timestamp, payment_status, booking_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'pending', ?)
  `;

    const bookingDate = new Date().toDateString(); // Format: Sun Jan 07 2024

    await pool.query(insertQuery, [
      name,
      number,
      booking_for,
      travel_for_work,
      room_type,
      check_in,
      check_out,
      adults,
      rooms,
      children,
      price,
      length_of_stay,
      total_amount,
      paid_amount,
      balanceAmount,
      bookingDate
    ]);


    const updateRoomsQuery = `
      UPDATE rooms
      SET currently_available = currently_available - ?,
          length_of_stay = CONCAT(?, ' ', CASE WHEN ? = 1 THEN 'day' ELSE 'days' END),
          last_updated = NOW()
      WHERE room_type = ? AND currently_available >= ?;
    `;

    const restoreRoomsQuery = `
      UPDATE rooms
      SET currently_available = currently_available + ?,
          length_of_stay = 0,
          last_updated = NOW()
      WHERE room_type = ?;
    `;

    const roomTypeArray = Array.isArray(room_type) ? room_type : [room_type];

    for (const roomTypeCount of roomTypeArray) {
      const [roomType, count] = roomTypeCount.split(" - ");

      console.log(
        "Before Update - Room Details:",
        roomType,
        await getRoomDetails(roomType)
      );

      await pool.query(updateRoomsQuery, [
        count,
        count,
        count,
        roomType,
        count,
      ]);

      console.log(
        "After Update - Room Details:",
        roomType,
        await getRoomDetails(roomType)
      );
    }

    // Schedule a job to restore rooms after the length_of_stay is completed
    setTimeout(async () => {
      for (const roomTypeCount of roomTypeArray) {
        const [roomType, count] = roomTypeCount.split(" - ");

        console.log(
          "Before Restore - Room Details:",
          roomType,
          await getRoomDetails(roomType)
        );

        await pool.query(restoreRoomsQuery, [count, roomType]);

        console.log(
          "After Restore - Room Details:",
          roomType,
          await getRoomDetails(roomType)
        );
      }
    }, length_of_stay * 24 * 60 * 60 * 1000); // Convert length_of_stay to milliseconds

    await pool.query("COMMIT");

    console.log("Booking submitted successfully");
    res.status(200).json({ message: "Booking successful" });
  } catch (error) {
    await pool.query("ROLLBACK");

    console.error("Error submitting booking:", error.message);
    res.status(500).json({
      error: "Internal Server Error",
      details: error.message || "Unknown error occurred on the server.",
    });
  }
});

// ... (previous imports and configurations)

app.delete("/api/bookings/:bookingId", async (req, res) => {
  const bookingId = req.params.bookingId;

  try {
    if (!bookingId) {
      throw new Error("Invalid or missing booking ID in the request.");
    }

    await pool.query("START TRANSACTION");

    // Fetch room details to update room availability
    const [bookingDetails] = await pool.query(
      "SELECT * FROM bookings WHERE id = ?",
      [bookingId]
    );

    if (bookingDetails.length === 0) {
      throw new Error("Booking not found for the provided ID.");
    }

    const roomTypeValuesArray = bookingDetails[0].room_type
      .split(", ")
      .map((item) => item.split(" - "));

    const updateRoomsQuery = `
      UPDATE rooms
      SET currently_available = currently_available + ?,
          length_of_stay = CONCAT(length_of_stay, ' ', CASE WHEN ? = 1 THEN 'day' ELSE 'days' END),
          last_updated = NOW()
      WHERE room_type = ?;
    `;

    for (const [roomType, roomCount] of roomTypeValuesArray) {
      await pool.query(updateRoomsQuery, [roomCount, roomCount, roomType]);
    }

    // Delete the booking from the database
    await pool.query("DELETE FROM bookings WHERE id = ?", [bookingId]);

    await pool.query("COMMIT");

    console.log("Booking deleted successfully");
    res.status(200).json({ message: "Booking deleted successfully" });
  } catch (error) {
    await pool.query("ROLLBACK");

    console.error("Error deleting booking:", error.message);
    res.status(500).json({
      error: "Internal Server Error",
      details: error.message || "Unknown error occurred on the server.",
    });
  }
});

app.put("/api/bookings/:bookingId/payment", async (req, res) => {
  const bookingId = req.params.bookingId;
  const { paymentStatus } = req.body;

  try {
    if (!bookingId || !paymentStatus) {
      throw new Error(
        "Invalid or missing booking ID or payment status in the request."
      );
    }

    await pool.query("START TRANSACTION");

    const updateQuery = `
      UPDATE bookings
      SET payment_status = ?
      WHERE id = ?
    `;

    await pool.query(updateQuery, [paymentStatus, bookingId]);

    await pool.query("COMMIT");

    console.log("Payment status updated successfully");
    res.status(200).json({ message: "Payment status updated successfully" });
  } catch (error) {
    await pool.query("ROLLBACK");

    console.error("Error updating payment status:", error.message);
    res.status(500).json({
      error: "Internal Server Error",
      details: error.message || "Unknown error occurred on the server.",
    });
  }
});

app.get("/api/pendingCounts", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT COUNT(*) AS pendingCounts FROM bookings WHERE payment_status = ?",
      ["pending"]
    );
    const pendingCounts = rows[0].pendingCounts || 0;
    res.json({ pendingCounts });
  } catch (error) {
    console.error("Error fetching pending counts:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/api/bookings/:bookingId", async (req, res) => {
  const bookingId = req.params.bookingId;

  try {
    if (bookingId === "lastEnteredId") {
      // Fetch the last entered booking ID
      const [lastEnteredRows, lastEnteredFields] = await pool.query(
        "SELECT id FROM bookings ORDER BY id DESC LIMIT 1"
      );

      if (lastEnteredRows.length === 0) {
        res.status(404).json({ error: "No bookings found" });
        return;
      }

      const lastEnteredId = lastEnteredRows[0].id;
      res.json({ bookingDetails: { id: lastEnteredId } });
    } else {
      // Fetch booking details for the provided booking ID
      console.log("Fetching booking details for ID:", bookingId);

      const [rows, fields] = await pool.query(
        "SELECT * FROM bookings WHERE id = ?",
        [bookingId]
      );

      if (rows.length === 0) {
        console.log("Booking not found for ID:", bookingId);
        res.status(404).json({ error: "Booking not found" });
        return;
      }

      const bookingDetails = rows[0];
      console.log("Booking details:", bookingDetails);

      res.json({ bookingDetails });
    }
  } catch (error) {
    console.error("Error fetching booking details:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    if (!username || !password) {
      throw new Error("Invalid or missing username or password");
    }

    // Check for spaces in username or password
    if (username.includes(" ") || password.includes(" ")) {
      throw new Error("Username or password cannot contain spaces");
    }

    console.log(
      "Login Query:",
      "SELECT * FROM admin WHERE BINARY username = ? AND BINARY password = ?",
      [username, password]
    );

    // Execute the SQL query using prepared statements
    const [rows] = await pool.execute(
      "SELECT * FROM admin WHERE BINARY username = ? AND BINARY password = ?",
      [username, password]
    );

    if (rows.length === 1) {
      // Valid username and password
      res.status(200).json({ message: "Login successful" });
    } else {
      // Invalid username or password
      res.status(401).json({ error: "Invalid username or password" });
    }
  } catch (error) {
    console.error("Error during login:", error);
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
});


app.get("/api/bookingDetails", async (req, res) => {
  try {
    const [rows, fields] = await pool.query(
      "SELECT * FROM bookings ORDER BY id DESC"
    ); // Replace 'booking_details' with your actual table name
    res.json(rows);
  } catch (error) {
    console.error("Error fetching data:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// API endpoint for updating a booking
// API endpoint for updating a booking
app.put("/api/bookings/:bookingId", async (req, res) => {
  const bookingId = req.params.bookingId;
  const updatedBooking = req.body;

  try {
    if (!bookingId) {
      throw new Error("Invalid or missing booking ID in the request.");
    }

    await pool.query("START TRANSACTION");

    const updateQuery = `
      UPDATE bookings
      SET
        name = ?,
        number = ?,
        room_type = ?,
        check_in = ?,
        check_out = ?,
        rooms = ?,
        adults = ?,
        children = ?,
        price = ?,
        length_of_stay = ?,
        total_amount = ?,
        paid_amount = ?,
        balance_amount = ?,
        payment_status = ? -- Include payment_status in the SET clause
      WHERE id = ?
    `;

    await pool.query(updateQuery, [
      updatedBooking.name,
      updatedBooking.number,
      updatedBooking.room_type,
      updatedBooking.check_in,
      updatedBooking.check_out,
      updatedBooking.rooms,
      updatedBooking.adults,
      updatedBooking.children,
      updatedBooking.price,
      updatedBooking.length_of_stay,
      updatedBooking.total_amount,
      updatedBooking.paid_amount,
      updatedBooking.balance_amount,
      updatedBooking.payment_status, // Include payment_status value
      bookingId,
    ]);

    await pool.query("COMMIT");

    console.log("Booking updated successfully");
    console.log("Booking updated successfully", updatedBooking);
    res.status(200).json({ message: "Booking updated successfully" });
  } catch (error) {
    await pool.query("ROLLBACK");

    console.error("Error updating booking:", error.message);
    res.status(500).json({
      error: "Internal Server Error",
      details: error.message || "Unknown error occurred on the server.",
    });
  }
});

app.post("/api/available-rooms", async (req, res) => {
  try {
    const { checkInDate, checkOutDate } = req.body;

    // Function to format the date in the desired format (e.g., "Thu Feb 08 2024")
    const formatDate = (dateString) => {
      const date = new Date(dateString);
      const options = { weekday: 'short', month: 'short', day: '2-digit', year: 'numeric' };
      const formattedDate = date.toLocaleDateString('en-US', options);
      // Remove commas from the formatted date
      return formattedDate.replace(/,/g, '');
    };

    // Format the check-in and check-out dates
    const formattedCheckInDate = formatDate(checkInDate);
    const formattedCheckOutDate = formatDate(checkOutDate);

    // Log the formatted dates
    console.log('Checking for bookings between:', formattedCheckInDate, 'and', formattedCheckOutDate);

    // Prepare the SQL query to check if the date range exists in the database
    const dateRangeQuery = `
      SELECT room_type
FROM bookings
WHERE (check_in BETWEEN 'formattedCheckInDate' AND 'formattedCheckOutDate')
    OR (check_out BETWEEN 'formattedCheckInDate' AND 'formattedCheckOutDate');
    `;

    // Execute the query with the formatted dates as parameters
    const dateRangeResult = await pool.query(dateRangeQuery, [formattedCheckInDate, formattedCheckOutDate]);

    // Log the result of the query
    console.log('Date range query result:', dateRangeResult);

    // Initialize an empty array to store room types
    let roomTypes = [];

    // Extract room types from the query result and concatenate them into a single string
    for (let i = 0; i < dateRangeResult.length; i++) {
      for (let j = 0; j < dateRangeResult[i].length; j++) {
        if (dateRangeResult[i][j].room_type !== undefined) {
          roomTypes.push(dateRangeResult[i][j].room_type);
        }
      }
    }

    // Join the room types array into a single string
    const roomType = roomTypes.join(',');

    // Log the room type value
    console.log('Room types:', roomType);

    // Send the room type as part of the JSON response
    res.status(200).json({ roomType });
  } catch (error) {
    // Handle any errors that occur during the process
    console.error("Error fetching available rooms:", error.message);
    res.status(500).json({
      error: "Internal Server Error",
      details: error.message || "Unknown error occurred on the server.",
    });
  }
});

// Handle password change request
app.post("/api/change-password", async (req, res) => {
  const { oldPassword, newPassword, confirmPassword } = req.body;

  if (!oldPassword || !newPassword || !confirmPassword) {
    return res.json({ success: false, message: "All fields are required" });
  }

  const connection = await pool.getConnection();

  try {
    // Check if old password is correct
    const [rows] = await connection.query(
      "SELECT * FROM admin WHERE password = ?",
      [oldPassword]
    );

    if (rows.length > 0) {
      if (newPassword !== oldPassword) {
        if (confirmPassword === newPassword) {
          // Update password in the database
          await connection.query(
            "UPDATE admin SET password = ? WHERE password = ?",
            [newPassword, oldPassword]
          );

          return res.json({
            success: true,
            message: "Your new password updated successfully",
          });
        } else {
          return res.json({
            success: false,
            message: "New password does not match",
          });
        }
      } else {
        return res.json({
          success: false,
          message: "New password should not be the same as the old password",
        });
      }
    } else {
      return res.json({
        success: false,
        message: "Old password does not match",
      });
    }
  } catch (error) {
    console.error("Error:", error);
    return res.json({ success: false, message: "Server error" });
  } finally {
    connection.release();
  }
});

app.get('/', (req, res) => {
    res.send('Hello, World!');
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
