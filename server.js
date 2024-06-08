const express = require("express");
const cors = require("cors");
const pool = require("./db.js"); // Import the common database connection
const app = express();
// const { DateTime } = require("luxon");
const axios = require("axios");
const mysql = require("mysql");
const bodyParser = require("body-parser");
// const session = require("express-session"); // Add this line for session management
const multer = require("multer");
const fs = require("fs");
// const admin = require("firebase-admin");
const path = require("path");
const nodemailer = require("nodemailer");
// const dotenv = require('dotenv'); // Import dotenv to read environment variables
// const twilio = require('twilio');
require("dotenv").config(); // Load environment variables from .env file
// Define otpVerificationRouter before using it
const PORT = process.env.PORT || 5000;

//////////////////////////////////////////////
// Middleware function to check for direct access to API routes
const preventDirectAccessToApi = (req, res, next) => {
  const isApiRequest = req.originalUrl.startsWith("/");
  if (isApiRequest && !req.headers.referer) {
    // If it's an API request and there's no Referer header, respond with an error
    return res.status(403).json({ error: "Direct access to API not allowed" });
  }
  // If it's not an API request or if there's a Referer header, proceed to the next middleware/route handler
  next();
};

// Apply the middleware to all routes
app.use(preventDirectAccessToApi);
///////////////////////////////////////////////

app.use(cors());

// const pool = mysql.createConnection({
//   host: "localhost",
//   user: "root",
//   password: "",
//   database: "fabro",
// });
pool.connect((err) => {
  if (err) {
    console.error("Error connecting to MySQL database:", err);
    return;
  }
  console.log("Connected to MySQL database");
});

// Establish database connection
// pool.getConnection((err, connection) => {
//   if (err) {
//     console.error('Failed to connect to the database:', err);
//   } else {
//     console.log('Connected to the database');
//     // Release the connection
//     connection.release();
//   }
// });

// Middleware to log requests
// app.use((req, res, next) => {
//   console.log(`${req.method} ${req.url}`);
//   next();
// });

// // Middleware to log errors
// app.use((err, req, res, next) => {
//   console.error(err.stack);
//   res.status(500).send("Something broke!");
// });

const fast2sms = require("fast-two-sms");

// Fetch admin name from the database
app.get("/api/adminName", (req, res) => {
  const query = "SELECT username FROM admin LIMIT 1";
  pool.query(query, (error, results) => {
    if (error) {
      console.error("Failed to fetch admin name:", error);
      return res.status(500).json({ error: "Failed to fetch admin name" });
    }

    const adminName = results.length > 0 ? results[0].username : "Admin"; // Default to "Admin" if no admin found
    res.status(200).json({ name: adminName });
  });
});

app.post("/cancelbooking", async (req, res) => {
  try {
    const { bookingId, cancellation } = req.body;

    // Insert a new record into the 'cancellations' table
    const result = pool.query(
      "INSERT INTO cancellations (booking_id, cancellation) VALUES (?, ?)",
      [bookingId, cancellation]
    );

    console.log(
      `Cancellation record inserted for booking ID ${bookingId} with status: ${cancellation}`
    );

    // Send a success response to the client
    res.status(200).send("Room booking cancelled successfully");
  } catch (error) {
    // Log the error and send an error response to the client
    console.error("Failed to cancel room booking:", error);
    res.status(500).send("Failed to cancel room booking");
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

app.post("/sendotp", async (req, res) => {
  try {
    const { number } = req.body;

    // Check if the provided mobile number exists in the 'bookings' table
    pool.query(
      "SELECT * FROM bookings WHERE number = ?",
      [number],
      async (error, results) => {
        if (error) {
          console.error("Error fetching existing booking:", error);
          return res.status(500).send("Failed to send OTP");
        }

        if (!results || results.length === 0) {
          // If the number is not found in the database, send an error message to the client
          console.log(
            `Mobile number ${number} does not exist in the bookings table.`
          );
          const errorMessage =
            "This number is not associated with any bookings.";
          console.log(`Sending response to client: ${errorMessage}`);
          return res.status(400).send(errorMessage);
        }

        // Generate OTP
        const otp = generateOTP();

        // Store OTP in the database
        pool.query("UPDATE bookings SET otp = ? WHERE number = ?", [
          otp,
          number,
        ]);
        console.log(
          `OTP ${otp} stored in the database for mobile number ${number}.`
        );

        // Send OTP to the provided number
        const response = await axios.get(
          `http://login.smsgatewayhub.com/api/mt/SendSMS?user=Seasensesoftwares&password=Stripl@1&senderid=SEASEN&channel=Trans&DCS=0&flashsms=0&number=${number}&text=Dear ${otp}, Many more happy returns of the day. With regards Sea Sense Group.&route=47&DLTTemplateId=1707161044624969443&PEID=1701159125640974053`
        );

        console.log(`OTP ${otp} sent to ${number} successfully.`);
        res.status(200).send("OTP sent successfully");
        console.log(`Response sent to client: OTP sent successfully`);
      }
    );
  } catch (error) {
    console.error(error);
    res.status(500).send("Failed to send OTP");
    console.log(`Response sent to client: Failed to send OTP`);
  }
});

app.post("/verifyotp", async (req, res) => {
  try {
    const { number, otp } = req.body;

    // Retrieve all matching rows from the database in descending order of timestamp
    pool.query(
      "SELECT * FROM bookings WHERE number = ? ORDER BY id DESC",
      [number],
      async (error, matchingBookings) => {
        if (error) {
          console.error("Error fetching matching bookings:", error);
          return res.status(500).send("Failed to verify OTP");
        }

        // Check if there are any matching rows
        if (matchingBookings && matchingBookings.length > 0) {
          // Check if the provided OTP matches any of the stored OTPs
          const matchedBookings = matchingBookings.filter(
            (booking) => booking.otp === otp
          );

          if (matchedBookings.length > 0) {
            // If OTP is verified successfully, delete it from the map
            otpMap.delete(number);

            // Log room details
            console.log("Room details:", matchedBookings);

            res.status(200).send(matchedBookings); // Send the matched row details as response
          } else {
            res.status(400).send("Invalid OTP");
          }
        } else {
          res.status(400).send("No matching records for the provided number");
        }
      }
    );
  } catch (error) {
    console.error("Failed to verify OTP:", error);
    res.status(500).send("Failed to verify OTP");
  }
});

// Update the status of a room
app.put("/api/updateStatus", async (req, res) => {
  try {
    // Extract isActive and roomId from the request body
    const { isActive, roomId } = req.body;

    // Update the status of rooms in the database
    pool.query("UPDATE rooms SET status = ? WHERE id = ?", [isActive, roomId]);

    // Send a success response to the client
    res.status(200).json({ message: "Status updated successfully" });
  } catch (error) {
    // Log the error and send an error response to the client
    console.error("Failed to update status:", error);
    res.status(500).json({ error: "Failed to update status" });
  }
});

// Fetch the status of the switch for all room types
app.get("/api/getStatuss", (req, res) => {
  // Execute the query
  pool.query("SELECT room_type, status FROM rooms", (error, results) => {
    if (error) {
      console.error("Failed to fetch status:", error);
      return res.status(500).json({ error: "Failed to fetch status" });
    }

    // Check if results are empty
    if (results.length === 0) {
      console.error("No data returned from query");
      return res.status(404).json({ error: "No data available" });
    }

    const statusByRoomType = {};
    // Process the results
    results.forEach((row) => {
      const { room_type, status } = row;
      statusByRoomType[room_type] = status;
    });

    // console.log("Fetched room status:", statusByRoomType);
    res.status(200).json(statusByRoomType);
  });
});
// Fetch the status of the switch for a specific room
app.get("/api/getStatus/:roomId", (req, res) => {
  // Extract the room ID from the request parameters
  const { roomId } = req.params;

  // Log the room ID received in the request
  console.log("Received request for room ID:", roomId);

  // Prepare the SQL query to fetch the status based on the room ID
  const query = "SELECT status FROM rooms WHERE id = ?";

  // Execute the query with the room ID as a parameter
  pool.query(query, [roomId], (error, results) => {
    if (error) {
      // Log the error and send an error response to the client
      console.error("Failed to fetch status:", error);
      return res.status(500).json({ error: "Failed to fetch status" });
    }

    // Check if the status is found for the given room ID
    if (results.length === 0) {
      // Log if the status is not found
      console.log("Status not found for room ID:", roomId);
      return res
        .status(404)
        .json({ error: "Status not found for the provided room ID" });
    }

    // Extract the status value from the query result
    const { status } = results[0];

    // Log the extracted status value
    console.log("Status value:", status);

    // Send the status as a response
    res.status(200).json({ status });
  });
});

// Add a new route to fetch room details
app.get("/roomdetails/:number", async (req, res) => {
  try {
    const { number } = req.params;

    // Fetch room details associated with the verified number from the database
    const [roomDetails] = pool.query(
      "SELECT * FROM bookings WHERE number = ?",
      [number]
    );

    // Log the fetched room details
    console.log(
      `Room details fetched successfully for number ${number}:`,
      roomDetails
    );

    res.json(roomDetails); // Send room details as JSON response
  } catch (error) {
    console.error("Failed to fetch room details:", error);
    res.status(500).send("Failed to fetch room details");
  }
});

app.post("/sendmessage", (req, res) => {
  const { number } = req.body;
  sendMessage(number, res);
});
//http://login.smsgatewayhub.com/api/mt/SendSMS?user=Seasensesoftwares&password=Stripl@1&senderid=SEASEN&channel=Trans&DCS=0&flashsms=0&number=9489318959&text=Dear 78745, Many more happy returns of the day. With regards Sea Sense Group.&route=47&DLTTemplateId=1707161044624969443&PEID=1701159125640974053
function sendMessage(number, res) {
  const options = {
    authorization:
      "fvTSICR1FhGHDt5X36Eur00MF5TFEtrZt0VMo6VCD2WOdRFPbjqb2XcqjKmS",
    message: "hello",
    numbers: [number],
  };

  fast2sms
    .sendMessage(options)
    .then((response) => {
      if (response.return === true) {
        console.log(`OTP sent successfully: ${response.sms.message}`);
      }
      res.send("SMS OTP sent successfully");
      console.log(response);
    })
    .catch((error) => {
      res.status(500).send("Error occurred while sending OTP");
      console.error(error);
    });
}

const transporter = nodemailer.createTransport({
  service: "Gmail",
  auth: {
    user: process.env.EMAIL_ADDRESS,
    pass: process.env.EMAIL_PASSWORD,
  },
});

// Middleware
app.use(express.json());

// Route to send email
app.post("/send-email", (req, res) => {
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
    `,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error("Error sending email:", error);
      res
        .status(500)
        .json({ error: "Failed to send email", details: error.message });
    } else {
      console.log("Email sent:", info.response);
      res.status(200).json({ message: "Email sent successfully" });
    }
  });
});

app.use("/uploads", express.static("uploads"));
app.use(express.json());
app.use(cors());

//RoomsCoverImages

// Define storage for multer
const coverImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const destinationFolder = "./uploads/coverimages";
    fs.mkdirSync(destinationFolder, { recursive: true });
    cb(null, destinationFolder);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now(); // Get current timestamp
    const fileName = `${timestamp}_${file.originalname}`; // Append timestamp to filename
    cb(null, fileName);
  },
});

// Use multer with the defined storage for cover images
const coverImageUpload = multer({ storage: coverImageStorage });

// Handle cover image upload
app.post(
  "/uploadCoverImage",
  coverImageUpload.single("image"),
  async (req, res) => {
    try {
      const imageUrl = `/uploads/coverimages/${req.file.filename}`;
      const roomType = req.body.roomType; // Retrieve room type from the request body

      // Insert imageUrl and roomType into the database
      pool.query(
        "INSERT INTO roomgallerycoverimages (image_url, room_type) VALUES (?, ?)",
        [imageUrl, roomType],
        (error, result) => {
          if (error) {
            console.error("Error uploading cover image:", error);
            return res
              .status(500)
              .json({ error: "Internal Server Error", details: error.message });
          }
          res.json({
            success: true,
            message: "Cover image uploaded successfully",
          });
        }
      );
    } catch (error) {
      console.error("Error uploading cover image:", error);
      res
        .status(500)
        .json({ error: "Internal Server Error", details: error.message });
    }
  }
);

// Handle updating cover image
app.put(
  "/updateCoverImage/:imageName",
  coverImageUpload.single("image"),
  async (req, res) => {
    const { imageName } = req.params;

    try {
      // Ensure that a file was uploaded
      if (!req.file) {
        return res.status(400).json({ error: "No image file uploaded" });
      }

      // Construct the new relative image URL
      const updatedImageUrl = `/uploads/coverimages/${req.file.filename}`;

      // Update the image URL in the database
      const query =
        "UPDATE roomgallerycoverimages SET image_url = ? WHERE image_url = ?";
      pool.query(
        query,
        [updatedImageUrl, `/uploads/coverimages/${imageName}`],
        async (error, result) => {
          if (error) {
            console.error("Error updating cover image:", error);
            return res
              .status(500)
              .json({ error: "Internal Server Error", details: error.message });
          }

          if (result.affectedRows > 0) {
            // Delete the existing image file
            const existingImagePath = `./uploads/coverimages/${imageName}`;
            fs.unlink(existingImagePath, (unlinkErr) => {
              if (unlinkErr) {
                console.error("Error deleting existing image:", unlinkErr);
              } else {
                console.log(
                  "Existing image deleted successfully:",
                  existingImagePath
                );
              }
            });

            // Send a success response to the client
            res.status(200).json({
              success: true,
              message: "Cover image updated successfully",
            });
          } else {
            // If no rows were affected, return a 404 error
            res.status(404).json({ error: "Cover image not found" });
          }
        }
      );
    } catch (error) {
      console.error("Error updating cover image:", error);
      res
        .status(500)
        .json({ error: "Internal Server Error", details: error.message });
    }
  }
);

// API Route to delete cover image
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
    pool.query(
      "DELETE FROM roomgallerycoverimages WHERE image_url = ?",
      [imageUrl],
      async (error, result) => {
        if (error) {
          console.error("Error deleting cover image:", error);
          return res
            .status(500)
            .json({ error: "Internal Server Error", details: error.message });
        }

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
            res.status(200).json({
              success: true,
              message: "Cover image deleted successfully",
            });
          });
        } else {
          console.error("Cover image file not found:", imagePath);
          res.status(404).json({ error: "Cover image file not found" });
        }
      }
    );
  } catch (error) {
    console.error("Error deleting cover image:", error);
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
});

// API Route to fetch cover images
app.get("/api/roomgallerycoverimages", (req, res) => {
  try {
    // Fetch cover images from the database
    pool.query(
      "SELECT * FROM roomgallerycoverimages",
      (error, results, fields) => {
        if (error) {
          console.error("Error fetching cover images:", error);
          return res
            .status(500)
            .json({ error: "Internal Server Error", details: error.message });
        }

        console.log("Fetched rows:", results); // Log fetched rows

        // Extract image URLs and room types from the rows
        const imageData = results.map((row) => ({
          imageUrl: row.image_url,
          roomType: row.room_type,
        }));
        console.log("Image Data:", imageData); // Log image data

        res.json(imageData);
      }
    );
  } catch (error) {
    console.error("Error fetching cover images:", error);
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
});

// // Middleware to check authentication
// const requireAuth = (req, res, next) => {
//   if (req.session && req.session.user) {
//     return next();
//   } else {
//     res.redirect("Admin/Login");
//   }
// };

/* 
const coverImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const destinationFolder = './uploads/coverimages';
    fs.mkdirSync(destinationFolder, { recursive: true });
    cb(null, destinationFolder);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now(); // Get current timestamp
    const fileName = `${timestamp}_${file.originalname}`; // Append timestamp to filename
    cb(null, fileName);
  },
});
 */

// Define storage for multer
// Define storage for multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const roomType = req.query.roomType;
    console.log("room", roomType);
    const destinationFolder = `./uploads/${roomType}`;
    fs.mkdirSync(destinationFolder, { recursive: true });
    cb(null, destinationFolder);
  },
  filename: (req, file, cb) => {
    const roomType = req.query.roomType; // Retrieve roomType from query
    const timestamp = Date.now(); // Get current timestamp
    const fileName = `${timestamp}_${file.originalname}`; // Append timestamp to filename
    const destinationPath = `./uploads/${roomType}/${fileName}`;
    console.log("Saving file to:", destinationPath);
    cb(null, fileName);
  },
});

// Use multer with the defined storage
const upload = multer({ storage: storage });

// Handle image upload
app.post("/upload", upload.single("image"), async (req, res) => {
  try {
    const roomType = req.query.roomType || "default";
    const imageUrl = `/uploads/${roomType}/${req.file.filename}`;

    // Insert imageUrl into the corresponding database table based on room type
    pool.query(
      `INSERT INTO ${roomType.toLowerCase()}images (image_url) VALUES (?)`,
      [imageUrl],
      (error, result) => {
        if (error) {
          console.error("Error uploading image:", error);
          return res
            .status(500)
            .json({ error: "Internal Server Error", details: error.message });
        }
        res.json({ success: true, message: "Image uploaded successfully" });
      }
    );
  } catch (error) {
    console.error("Error uploading image:", error);
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
});

app.get("/api/roomimages", (req, res) => {
  try {
    const { roomType } = req.query;

    if (!roomType) {
      return res.status(400).json({ error: "Room type is required" });
    }

    // Sanitize roomType to prevent SQL injection
    const sanitizedRoomType = roomType.toLowerCase().replace(/[^a-z0-9_]/g, "");
    const query = `SELECT image_url FROM ${sanitizedRoomType}roomimages`;

    // Execute the query
    pool.query(query, (error, results) => {
      if (error) {
        console.error(
          `Error fetching ${req.query.roomType} room images:`,
          error
        );
        return res
          .status(500)
          .json({ error: "Internal Server Error", details: error.message });
      }

      const imageUrls = results.map((row) => row.image_url);
      res.json(imageUrls);
    });
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
    console.log("roomTyperoomTyperoomTyperoomType", roomType);

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
          pool.query(
            query,
            [updatedImageUrl, `/uploads/${roomType}/${imageName}`],
            async (error, result) => {
              if (error) {
                console.error("Error updating image in database:", error);
                res.status(500).json({
                  error: "Internal Server Error",
                  details: error.message,
                });
                return;
              }

              if (result.affectedRows > 0) {
                // Log success message
                console.log("Image updated successfully in the database.");

                // Delete the previous image from the folder
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
                res.status(200).json({
                  success: true,
                  message: "Image updated successfully",
                });
              } else {
                // If no rows were affected, return a 404 error
                res.status(404).json({ error: "Image not found" });
              }
            }
          );
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
    pool.query(
      `DELETE FROM ${tableName} WHERE image_url = ?`,
      [imageUrl],
      (error, result) => {
        if (error) {
          console.error("Error deleting image from database:", error);
          return res
            .status(500)
            .json({ error: "Internal Server Error", details: error.message });
        }

        // Check if image was found and deleted from the database
        if (result.affectedRows === 0) {
          console.error("Image not found in the database");
          return res
            .status(404)
            .json({ error: "Image not found in the database" });
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
            console.log("Image file deleted successfully:", imagePath);
            res
              .status(200)
              .json({ success: true, message: "Image deleted successfully" });
          });
        } else {
          console.error("Image file not found:", imagePath);
          res.status(404).json({ error: "Image file not found" });
        }
      }
    );
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
      const [result, fields] = pool.query(
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
    const [rows, fields] = pool.query(query);
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

// Handle room counts request
app.get("/api/roomCounts", (req, res) => {
  pool.query(
    "SELECT SUM(no_of_rooms) AS totalRooms FROM rooms",
    (error, results) => {
      if (error) {
        console.error("MySQL query error:", error);
        return res.status(500).json({ error: "Internal Server Error" });
      }

      const totalRooms = results.length > 0 ? results[0].totalRooms || 0 : 0;
      res.json({ totalRooms });
    }
  );
});

// Import necessary modules and set up your server

// Assuming you have pool initialized for your database connection

app.get("/api/roomLimits", (req, res) => {
  try {
    // Execute the query to fetch room limits
    pool.query("SELECT id, no_of_rooms FROM rooms", (error, results) => {
      if (error) {
        console.error("Error fetching room limits:", error);
        return res.status(500).json({ error: "Internal Server Error" });
      }

      // Extract room limits from the query results
      const roomLimits = {};
      results.forEach((row) => {
        roomLimits[row.id] = row.no_of_rooms;
      });

      // Send room limits as a JSON response
      res.json({ roomLimits });
    });
  } catch (error) {
    console.error("Error fetching room limits:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Function to get room details from the database
// const getRoomDetails = async (roomType) => {
//   const query = "SELECT currently_available, length_of_stay, last_updated FROM rooms WHERE room_type = ?";
//   const [results] = pool.query(query, [roomType]);
//   return results[0];
// };

app.put("/api/cancel/:bookingId/cancel", async (req, res) => {
  const bookingId = req.params.bookingId;

  try {
    if (!bookingId) {
      throw new Error("Invalid or missing booking ID in the request.");
    }

    // Start transaction
    pool.query("START TRANSACTION");

    // Update cancellation status in bookings table
    const cancelQuery = `
      UPDATE bookings
      SET cancellation = 'cancelled'
      WHERE id = ?;
    `;
    pool.query(cancelQuery, [bookingId]);

    // Fetch booking details before cancellation
    const getBookingDetailsQuery = `
      SELECT name, room_type, check_in, check_out
      FROM bookings
      WHERE id = ?;
    `;
    pool.query(getBookingDetailsQuery, [bookingId], (err, result) => {
      if (err) {
        console.error("Error fetching booking details:", err);
        res.status(500).json({
          error: "Internal Server Error",
          details: "An error occurred while fetching booking details.",
        });
        return;
      }

      const { name, room_type, check_in, check_out } = result[0];

      // Construct notification message
      const notificationMessage = `The booking for ${name}, with room type ${room_type}, scheduled from ${check_in} to ${check_out}, has been cancelled.
      `;

      // Insert notification into notification table
      const insertNotificationQuery = `
        INSERT INTO notification (notify)
        VALUES (?);
      `;
      pool.query(
        insertNotificationQuery,
        [notificationMessage],
        (err, result) => {
          if (err) {
            console.error("Error inserting notification:", err);
            res.status(500).json({
              error: "Internal Server Error",
              details: "An error occurred while inserting notification.",
            });
            return;
          }

          // Commit transaction
          pool.query("COMMIT");

          console.log("Booking cancelled successfully");
          res.status(200).json({ message: "Booking cancelled successfully" });
        }
      );
    });
  } catch (error) {
    // Rollback transaction on error
    pool.query("ROLLBACK");

    console.error("Error cancelling booking:", error.message);
    res.status(500).json({
      error: "Internal Server Error",
      details: error.message || "Unknown error occurred on the server.",
    });
  }
});

app.get("/api/cancelledRoomCounts", (req, res) => {
  const cancelledRoomCountsQuery = `
    SELECT COUNT(*) AS cancelledRoomCounts FROM bookings WHERE cancellation = 'cancelled';
  `;

  pool.query(cancelledRoomCountsQuery, (error, results) => {
    if (error) {
      console.error("Error fetching cancelled room counts:", error.message);
      return res.status(500).json({
        error: "Internal Server Error",
        details: error.message || "Unknown error occurred on the server.",
      });
    }

    const cancelledRoomCounts = results[0].cancelledRoomCounts;
    res.status(200).json({ cancelledRoomCounts });
  });
});

app.get("/api/cancelledRoomDetails", (req, res) => {
  const cancelledRoomDetailsQuery = `
    SELECT * FROM bookings
    WHERE cancellation = 'cancelled'
    ORDER BY id DESC;
  `;

  pool.query(cancelledRoomDetailsQuery, (error, results) => {
    if (error) {
      console.error("Error fetching cancelled room details:", error.message);
      return res.status(500).json({
        error: "Internal Server Error",
        details: error.message || "Unknown error occurred on the server.",
      });
    }

    console.log("Cancelled room details fetched successfully");
    res.status(200).json(results);
  });
});

app.get("/api/booking/:id/cancellationStatus", (req, res) => {
  const bookingId = req.params.id;

  const query = "SELECT cancellation FROM bookings WHERE id = ?";
  pool.query(query, [bookingId], (error, results) => {
    if (error) {
      console.error("Error fetching cancellation status:", error);
      return res.status(500).json({
        error: "An error occurred while fetching cancellation status",
      });
    }

    if (!results || results.length === 0) {
      console.log(`No cancellation status found for booking ID ${bookingId}`);
      return res.json({ cancellation: null });
    }

    const cancellationStatus = results[0].cancellation;
    console.log(
      `Cancellation status for booking ID ${bookingId}: ${cancellationStatus}`
    );
    res.json({ cancellation: cancellationStatus });
  });
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

const addNotification = async (message) => {
  try {
    // Add a new notification to the database
    await pool.query("INSERT INTO notification (notify) VALUES (?)", [message]);
    console.log("Notification added successfully.");
  } catch (error) {
    console.error("Error adding notification:", error);
    throw error; // Handle the error as needed
  }
};

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

    pool.query("START TRANSACTION");

    const insertQuery = `
      INSERT INTO bookings
      (order_id, name, number, booking_for, travel_for_work, room_type, check_in, check_out, rooms, adults, children, price, length_of_stay, total_amount, paid_amount, payment_status, balance_amount, booking_date, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    function generateOrderId() {
      const prefix = "ORD"; // Static prefix for order ID
      // const timestamp = Date.now(); // Current timestamp
      const randomSuffix = Math.floor(100000 + Math.random() * 900000); // Random five-digit number

      // Concatenate components to form the order ID
      const orderId = prefix + randomSuffix;

      return orderId;
    }

    // Example usage
    const orderId = generateOrderId();
    console.log(orderId);

    const bookingDate = new Date().toDateString(); // Format: Sun Jan 07 2024
    const currentTimestamp = new Date(); // Current timestamp

    const roomTypeArray = room_type.map(
      (room) => `${room.roomType} - ${room.roomCount}`
    );
    const roomTypeValues = roomTypeArray.join(", ");

    await pool.query(insertQuery, [
      orderId,
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
      "pending",
      total_amount, // Setting balance_amount to total_amount initially
      bookingDate,
      currentTimestamp,
    ]);

    pool.query("COMMIT");

    // Add a notification for the new booking
    const notificationMessage = `New booking made by ${name} for ${
      length_of_stay === 1 ? "day" : "days"
    } from ${check_in} to ${check_out}`;
    await addNotification(notificationMessage);

    console.log("Booking submitted successfully");

    res.status(200).json({ message: "Booking submitted successfully" });
  } catch (error) {
    pool.query("ROLLBACK");

    console.error("Error submitting booking:", error.message);
    res.status(500).json({
      error: "Internal Server Error",
      details: error.message || "Unknown error occurred on the server.",
    });
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

    pool.query("START TRANSACTION");

    function generateOrderId() {
      const prefix = "ORD"; // Static prefix for order ID
      // const timestamp = Date.now(); // Current timestamp
      const randomSuffix = Math.floor(100000 + Math.random() * 900000); // Random five-digit number

      // Concatenate components to form the order ID
      const orderId = prefix + randomSuffix;

      return orderId;
    }

    // Example usage
    const orderId = generateOrderId();
    console.log(orderId);

    const balanceAmount = total_amount - paid_amount;

    const insertQuery = `
      INSERT INTO bookings
      (order_id, name, number, booking_for, travel_for_work, room_type, check_in, check_out, adults, rooms, children, price, length_of_stay, total_amount, paid_amount, balance_amount, timestamp, payment_status, booking_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'pending', ?)
    `;

    const bookingDate = new Date().toDateString(); // Format: Sun Jan 07 2024

    pool.query(insertQuery, [
      orderId,
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
      bookingDate,
    ]);

    pool.query("COMMIT");

    console.log("Booking submitted successfully");
    res.status(200).json({ message: "Booking successful" });
  } catch (error) {
    pool.query("ROLLBACK");

    console.error("Error submitting booking:", error.message);
    res.status(500).json({
      error: "Internal Server Error",
      details: error.message || "Unknown error occurred on the server.",
    });
  }
});
// ... (previous imports and configurations)

// app.delete("/api/bookings/:bookingId", async (req, res) => {
//   const bookingId = req.params.bookingId;

//   try {
//     if (!bookingId) {
//       throw new Error("Invalid or missing booking ID in the request.");
//     }

//     console.log("Starting transaction...");
//     await pool.query("START TRANSACTION");

//     // Fetch room details to update room availability
//     const [bookingDetails] = await pool.query(
//       "SELECT * FROM bookings WHERE id = ?",
//       [bookingId]
//     );

//     if (bookingDetails.length === 0) {
//       throw new Error("Booking not found for the provided ID.");
//     }

//     const roomTypeValuesArray = bookingDetails[0].room_type
//       .split(", ")
//       .map((item) => item.split(" - "));

//     console.log("Room Type Values Array:", roomTypeValuesArray);

//     const updateRoomsQuery = `
//       UPDATE rooms
//       SET currently_available = currently_available + ?,
//           length_of_stay = CONCAT(length_of_stay, ' ', CASE WHEN ? = 1 THEN 'day' ELSE 'days' END),
//           last_updated = NOW()
//       WHERE room_type = ?;
//     `;

//     for (const [roomType, roomCount] of roomTypeValuesArray) {
//       console.log("Updating room:", roomType, roomCount);
//       await pool.query(updateRoomsQuery, [roomCount, roomCount, roomType]);
//     }

//     console.log("Deleting booking...");
//     // Delete the booking from the database
//     await pool.query("DELETE FROM bookings WHERE id = ?", [bookingId]);

//     console.log("Committing transaction...");
//     await pool.query("COMMIT");

//     console.log("Booking deleted successfully");
//     res.status(200).json({ message: "Booking deleted successfully" });
//   } catch (error) {
//     console.error("Error deleting booking:", error.message);
//     console.log("Rolling back transaction...");
//     await pool.query("ROLLBACK");

//     res.status(500).json({
//       error: "Internal Server Error",
//       details: error.message || "Unknown error occurred on the server.",
//     });
//   }
// });

app.delete("/api/bookings/:bookingId", (req, res) => {
  const bookingId = req.params.bookingId;

  const sql = "DELETE FROM bookings WHERE id = ?";
  pool.query(sql, [bookingId], (err, result) => {
    if (err) {
      console.error("Error deleting booking details");
      res.status(500).send("Error deleting booking details");
      return;
    }
    console.log("Booking deleted successfully");
    res.status(200).json({ message: "Booking deleted successfully" });
  });
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

    pool.query("START TRANSACTION");

    const updateQuery = `
      UPDATE bookings
      SET payment_status = ?
      WHERE id = ?
    `;

    pool.query(updateQuery, [paymentStatus, bookingId]);

    pool.query("COMMIT");

    console.log("Payment status updated successfully");
    res.status(200).json({ message: "Payment status updated successfully" });
  } catch (error) {
    pool.query("ROLLBACK");

    console.error("Error updating payment status:", error.message);
    res.status(500).json({
      error: "Internal Server Error",
      details: error.message || "Unknown error occurred on the server.",
    });
  }
});

app.get("/api/pendingCounts", async (req, res) => {
  try {
    const query =
      "SELECT COUNT(*) AS pendingCounts FROM bookings WHERE payment_status = ?";
    pool.query(query, ["pending"], (err, result) => {
      if (err) {
        console.error("Error executing MySQL query:", err);
        return res.status(500).json({ error: "Internal Server Error" });
      }

      const pendingCounts =
        (result && result[0] && result[0].pendingCounts) || 0;
      res.json({ pendingCounts });
    });
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
      pool.query(
        "SELECT id FROM bookings ORDER BY id DESC LIMIT 1",
        (error, results) => {
          if (error) {
            console.error("Error fetching last entered booking ID:", error);
            return res.status(500).json({ error: "Internal Server Error" });
          }

          if (results.length === 0) {
            return res.status(404).json({ error: "No bookings found" });
          }

          const lastEnteredId = results[0].id;
          res.json({ bookingDetails: { id: lastEnteredId } });
        }
      );
    } else {
      // Fetch booking details for the provided booking ID
      console.log("Fetching booking details for ID:", bookingId);

      pool.query(
        "SELECT * FROM bookings WHERE id = ?",
        [bookingId],
        (error, results) => {
          if (error) {
            console.error("Error fetching booking details:", error);
            return res.status(500).json({ error: "Internal Server Error" });
          }

          if (results.length === 0) {
            console.log("Booking not found for ID:", bookingId);
            return res.status(404).json({ error: "Booking not found" });
          }

          const bookingDetails = results[0];
          console.log("Booking details:", bookingDetails);

          res.json({ bookingDetails });
        }
      );
    }
  } catch (error) {
    console.error("Error in try-catch block:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    if (
      !username ||
      !password ||
      username.includes(" ") ||
      password.includes(" ")
    ) {
      throw new Error("Invalid username or password");
    }

    const sql =
      "SELECT * FROM admin WHERE BINARY username = ? AND BINARY password = ?";
    pool.query(sql, [username, password], (error, results) => {
      if (error) {
        console.error("Error during login:", error);
        return res.status(500).json({ error: "Internal Server Error" });
      }

      if (results.length === 1) {
        return res.status(200).json({ message: "Login successful" });
      } else {
        return res.status(401).json({ error: "Invalid username or password" });
      }
    });
  } catch (error) {
    console.error("Error during login:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/api/bookingDetails", (req, res) => {
  const query = "SELECT * FROM bookings ORDER BY id DESC"; // Replace 'bookings' with your actual table name
  pool.query(query, (err, rows) => {
    if (err) {
      console.error("Error executing MySQL query:", err);
      return res.status(500).json({ error: "Internal Server Error" });
    }

    res.json(rows);
  });
});

// API endpoint for updating a booking
app.put("/api/bookings/:bookingId", async (req, res) => {
  const bookingId = req.params.bookingId;
  const updatedBooking = req.body;

  try {
    if (!bookingId) {
      throw new Error("Invalid or missing booking ID in the request.");
    }

    pool.query("START TRANSACTION");

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

    pool.query(updateQuery, [
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

    pool.query("COMMIT");

    console.log("Booking updated successfully");
    console.log("Booking updated successfully", updatedBooking);
    res.status(200).json({ message: "Booking updated successfully" });
  } catch (error) {
    pool.query("ROLLBACK");

    console.error("Error updating booking:", error.message);
    res.status(500).json({
      error: "Internal Server Error",
      details: error.message || "Unknown error occurred on the server.",
    });
  }
});

//here due to the date issue i changed the dates by one day forward

// app.post("/api/available-rooms", (req, res) => {
//   try {
//     const { checkInDate, checkOutDate } = req.body;

//     // Function to format the date in the desired format (e.g., "Thu Apr 18 2024")
//     const formatDate = (dateString) => {
//       const date = new Date(dateString);
//       const options = {
//         weekday: "short",
//         month: "short",
//         day: "2-digit",
//         year: "numeric",
//       };
//       return date.toLocaleDateString("en-US", options).replace(/,/g, ""); // Remove commas from the formatted date
//     };

//     // Parse check-in and check-out dates
//     const checkIn = new Date(checkInDate);
//     const checkOut = new Date(checkOutDate);

//     // Increment both check-in and check-out dates by one day
//     checkIn.setDate(checkIn.getDate() + 1);
//     checkOut.setDate(checkOut.getDate() + 1);

//     // Format the adjusted check-in and check-out dates
//     const formattedCheckInDate = formatDate(checkIn);
//     const formattedCheckOutDate = formatDate(checkOut);

//     // Log the formatted dates
//     console.log(
//       "Checking for bookings between:",
//       formattedCheckInDate,
//       "and",
//       formattedCheckOutDate
//     );

//     // Prepare the SQL query to check if the date range exists in the database
//     const dateRangeQuery = `
//       SELECT room_type
//       FROM bookings
//       WHERE check_in = ? OR check_out = ?;
//     `;

//     // Execute the query with the formatted dates as parameters
//     pool.query(
//       dateRangeQuery,
//       [formattedCheckInDate, formattedCheckOutDate],
//       (err, result) => {
//         if (err) {
//           console.error("Error executing MySQL query:", err);
//           return res.status(500).json({ error: "Internal Server Error" });
//         }

//         // Extract room types from the query result
//         const roomTypes = result.map((row) => row.room_type).join(",");

//         // Log the room types
//         console.log("Room types:", roomTypes);

//         // Send the room types as part of the JSON response
//         res.status(200).json({ roomTypes });
//       }
//     );
//   } catch (error) {
//     // Handle any errors that occur during the process
//     console.error("Error fetching available rooms:", error.message);
//     res.status(500).json({
//       error: "Internal Server Error",
//       details: error.message || "Unknown error occurred on the server.",
//     });
//   }
// });

/////////////////////////////////////////////////////
app.post("/api/available-rooms", (req, res) => {
  try {
    const { checkInDate, checkOutDate } = req.body;
    console.log("req.body", req.body);
    // Function to format the date in the desired format (e.g., "Thu Apr 18 2024")
    const formatDate = (dateString) => {
      const date = new Date(dateString);
      const options = {
        weekday: "short",
        month: "short",
        day: "2-digit",
        year: "numeric",
      };
      return date.toLocaleDateString("en-US", options).replace(/,/g, ""); // Remove commas from the formatted date
    };

    // Format the check-in and check-out dates
    const formattedCheckInDate = formatDate(checkInDate);
    const formattedCheckOutDate = formatDate(checkOutDate);

    // Log the formatted dates
    console.log(
      "Checking for bookings between:",
      formattedCheckInDate,
      "and",
      formattedCheckOutDate
    );

    // Prepare the SQL query to check if the date range exists in the database
    const dateRangeQuery = `
    SELECT room_type, COUNT(*) AS count
    FROM bookings
    WHERE STR_TO_DATE(check_in, '%a %b %e %Y') <= STR_TO_DATE(?, '%a %b %e %Y')
    AND STR_TO_DATE(check_out, '%a %b %e %Y') >= STR_TO_DATE(?, '%a %b %e %Y')
    GROUP BY room_type;
    `;

    // Execute the query with the formatted dates as parameters
    pool.query(
      dateRangeQuery,
      [formattedCheckInDate, formattedCheckOutDate],
      (err, result) => {
        if (err) {
          console.error("Error executing MySQL query:", err);
          return res.status(500).json({ error: "Internal Server Error" });
        }

        // Extract room types from the query result
        const roomTypes = result.map((row) => row.room_type).join(",");

        // Log the room types
        console.log("Room types:", roomTypes);

        // Send the room types as part of the JSON response
        res.status(200).json({ roomTypes });
      }
    );
  } catch (error) {
    // Handle any errors that occur during the process
    console.error("Error fetching available rooms:", error.message);
    res.status(500).json({
      error: "Internal Server Error",
      details: error.message || "Unknown error occurred on the server.",
    });
  }
});

/////////////////////////////////////////////////////
// Handle password change request
app.post("/api/change-password", async (req, res) => {
  const { oldPassword, newPassword, confirmPassword } = req.body;

  if (!oldPassword || !newPassword || !confirmPassword) {
    return res.json({ success: false, message: "All fields are required" });
  }

  try {
    // Check if old password is correct
    pool.query(
      "SELECT * FROM admin WHERE password = ?",
      [oldPassword],
      async (error, rows) => {
        if (error) {
          console.error("Error:", error);
          return res.json({ success: false, message: "Server error" });
        }

        if (rows.length > 0) {
          if (newPassword !== oldPassword) {
            if (confirmPassword === newPassword) {
              // Update password in the database
              pool.query(
                "UPDATE admin SET password = ? WHERE password = ?",
                [newPassword, oldPassword],
                (error, result) => {
                  if (error) {
                    console.error("Error:", error);
                    return res.json({
                      success: false,
                      message: "Server error",
                    });
                  }
                  return res.json({
                    success: true,
                    message: "Your new password updated successfully",
                  });
                }
              );
            } else {
              return res.json({
                success: false,
                message: "New password does not match",
              });
            }
          } else {
            return res.json({
              success: false,
              message:
                "New password should not be the same as the old password",
            });
          }
        } else {
          return res.json({
            success: false,
            message: "Old password does not match",
          });
        }
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return res.json({ success: false, message: "Server error" });
  }
});

// // Serve static files from the React app
// app.use(express.static(path.join(__dirname, '..', 'fabro',  'build')));

// // Handle React routing, return all requests to React app
// app.get('*', (req, res) => {
//   res.sendFile(path.join(__dirname,  '..', 'fabro', 'build', 'index.html'));
// });

app.get("/api/totalbookings", (req, res) => {
  const sql = "SELECT COUNT(*) as TOTALBOOKINGS FROM bookings ";
  pool.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching total bookings");
      res.status(500).send("Error fetching total bookings");
      return;
    }
    const totalBookings = result[0].TOTALBOOKINGS; // Access TOTALBOOKINGS from result
    // console.log(`Total Bookings are ${totalBookings}`);
    res.json({ totalBookings });
  });
});

app.get("/api/totalpaidamount", (req, res) => {
  const sql = "SELECT SUM(paid_amount) AS totalPaidAmount FROM bookings";
  pool.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching total paid amount:", err);
      res.status(500).send("Error fetching total paid amount");
      return;
    }
    
    const totalPaidAmount = result[0].totalPaidAmount || 0; // Access totalPaidAmount from result
    res.json({ totalPaidAmount });
  });
});


app.get("/api/booking-status", (req, res) => {
  try {
    // Get today's date
    const today = new Date();

    // Calculate the time 2 hours from now
    const twoHoursFromNow = new Date(today.getTime() + 2 * 60 * 60 * 1000);

    // Query to fetch check-in and check-out dates from the booking table
    const bookingDatesQuery = `
      SELECT id, name, check_in, check_out, timestamp
      FROM bookings;
    `;

    // Execute the query to fetch booking dates
    pool.query(bookingDatesQuery, (err, result) => {
      if (err) {
        console.error("Error executing MySQL query:", err);
        return res.status(500).json({ error: "Internal Server Error" });
      }

      // Iterate through the bookings and check if any require reminders
      result.forEach((row) => {
        const checkInDate = new Date(row.check_in);
        const checkOutDate = new Date(row.check_out);

        // Check if the current time is within 2 hours of check-in
        if (checkInDate > today && checkInDate <= twoHoursFromNow) {
          const message = `${row.name} is ready to check-in within 2 hours.`;
          addNotificationToDatabase(row.id, message);
        }

        // Check if the current time is within 2 hours of check-out
        if (checkOutDate > today && checkOutDate <= twoHoursFromNow) {
          const message = `${row.name} is ready to checkout.`;
          addNotificationToDatabase(row.id, message);
        }
      });

      // Send a success response
      res.status(200).json({ message: "Booking status updated successfully." });
    });
  } catch (error) {
    // Handle any errors that occur during the process
    console.error("Error fetching booking status:", error.message);
    res.status(500).json({
      error: "Internal Server Error",
      details: error.message || "Unknown error occurred on the server.",
    });
  }
});

// Function to add a notification to the database
function addNotificationToDatabase(bookingId, message) {
  try {
    const addNotificationQuery = `
      INSERT INTO notification (booking_id, notify, is_read)
      VALUES (?, ?, FALSE);
    `;
    pool.query(addNotificationQuery, [bookingId, message], (err, result) => {
      if (err) {
        console.error("Error adding notification to database:", err);
      }
      console.log("Notification added to database:", message);
    });
  } catch (error) {
    console.error("Error adding notification to database:", error.message);
  }
}

// Store temporary data for rating and review
const tempData = {};

app.post("/api/bookings/:bookingId/rating", async (req, res) => {
  const { bookingId } = req.params;
  const { rating } = req.body;

  // Store rating temporarily
  tempData[bookingId] = { ...tempData[bookingId], rating };

  if (tempData[bookingId].review !== undefined) {
    const { review } = tempData[bookingId];
    delete tempData[bookingId]; // Remove temporary data after usage

    // Update rating in the database
    // Construct notification message and insert into notification table
    updateRatingAndReview(bookingId, rating, review, res);
  } else {
    res.status(200).json({ message: "Rating stored temporarily" });
  }
});

app.post("/api/bookings/:bookingId/review", async (req, res) => {
  const { bookingId } = req.params;
  const { review } = req.body;

  // Store review temporarily
  tempData[bookingId] = { ...tempData[bookingId], review };

  if (tempData[bookingId].rating !== undefined) {
    const { rating } = tempData[bookingId];
    delete tempData[bookingId]; // Remove temporary data after usage

    // Update rating in the database
    // Construct notification message and insert into notification table
    updateRatingAndReview(bookingId, rating, review, res);
  } else {
    res.status(200).json({ message: "Review stored temporarily" });
  }
});

// Function to update rating and review in the database and insert notification
function updateRatingAndReview(bookingId, rating, review, res) {
  const updateRatingSql =
    "UPDATE bookings SET rating = ?, review = ? WHERE id = ?";
  const getBookingSql = "SELECT name FROM bookings WHERE id = ?";

  // Update rating and review in the database
  pool.query(updateRatingSql, [rating, review, bookingId], (err, result) => {
    if (err) {
      console.error("Error updating rating and review:", err);
      res
        .status(500)
        .json({ error: "An error occurred while updating rating and review" });
      return;
    }

    // Retrieve name from the bookings table
    pool.query(getBookingSql, [bookingId], (err, result) => {
      if (err) {
        console.error("Error retrieving name:", err);
        res
          .status(500)
          .json({ error: "An error occurred while retrieving name" });
        return;
      }

      const name = result[0].name;
      const notificationMessage = `${name} rated ${rating} and reviewed "${review}"`;

      // Insert notification into the notification table
      const insertNotificationSql =
        "INSERT INTO notification (notify) VALUES (?)";
      pool.query(
        insertNotificationSql,
        [notificationMessage],
        (err, result) => {
          if (err) {
            console.error("Error inserting notification:", err);
            res.status(500).json({
              error: "An error occurred while inserting notification",
            });
            return;
          }

          res
            .status(200)
            .json({ message: "Rating and review updated successfully" });
        }
      );
    });
  });
}

app.get("/api/notifications", (req, res) => {
  const sql =
    "SELECT id, is_read, timestamp, notify FROM notification ORDER BY id DESC";
  pool.query(sql, (err, result) => {
    if (err) {
      console.log("error fetching notifications");
      return;
    }

    console.log("Notifications fetched successfully");
    res.json(result);
    // console.log(result);
  });
});

app.post("/api/mark-all-as-read", (req, res) => {
  const sql = "UPDATE notification SET `is_read` = true";
  pool.query(sql, (err, result) => {
    if (err) {
      console.error("Error marking all notifications as read:", err);
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }
    console.log("All notifications marked as read successfully");
    res
      .status(200)
      .json({ message: "All notifications marked as read successfully" });
  });
});

app.post("/api/mark-as-read/:id", (req, res) => {
  const { id } = req.params;
  const sql = "UPDATE notification SET `is_read` = true WHERE id = ?";
  pool.query(sql, [id], (err, result) => {
    if (err) {
      console.error("Error marking notification as read:", err);
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }
    console.log(`Notification ${id} marked as read successfully`);
    res
      .status(200)
      .json({ message: `Notification ${id} marked as read successfully` });
  });
});

// API endpoint to handle insertion of selected services into the database
app.post("/api/addServices", (req, res) => {
  const services = req.body.services;

  // Check if services data is provided
  if (!services || !Array.isArray(services) || services.length === 0) {
    return res.status(400).json({ error: "No services provided" });
  }

  // Construct SQL query to insert services into the database
  const sql = "INSERT INTO services (label) VALUES ?";

  // Extract service names from the services array
  const values = services.map((service) => [service.label]);

  // Execute the SQL query
  pool.query(sql, [values], (err, result) => {
    if (err) {
      console.error("Error inserting services:", err);
      return res.status(500).json({ error: "Failed to insert services" });
    }
    console.log("Services inserted successfully");
    res.json({ message: "Services inserted successfully" });
  });
});

// API endpoint to handle insertion of custom service into the database
app.post("/api/addCustomService", (req, res) => {
  const serviceName = req.body.name;

  // Check if service name is provided
  if (!serviceName) {
    return res.status(400).json({ error: "No service name provided" });
  }

  // Construct SQL query to insert custom service into the database
  const sql = "INSERT INTO services (label) VALUES (?)";

  // Execute the SQL query
  pool.query(sql, [serviceName], (err, result) => {
    if (err) {
      console.error("Error inserting custom service:", err);
      return res.status(500).json({ error: "Failed to insert custom service" });
    }
    console.log("Custom service inserted successfully");
    // Respond with success message
    res.json({ message: "Custom service inserted successfully" });
  });
});

// Route to fetch services
app.get("/api/getServices", (req, res) => {
  // Prepare the SQL query
  const sql = "SELECT * FROM services";

  // Execute the SQL query
  pool.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching services:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
    res.json(result);
    console.log("result", result);
  });
});

// Route to delete a service by ID
app.delete("/api/deleteService/:id", (req, res) => {
  const serviceId = req.params.id;

  // Prepare the SQL query to delete the service by ID
  const sql = "DELETE FROM services WHERE id = ?";

  // Execute the SQL query with the service ID as a parameter
  pool.query(sql, [serviceId], (err, result) => {
    if (err) {
      console.error("Error deleting service:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
    // If the service was deleted successfully, return success message
    res.json({ message: "Service deleted successfully" });
  });
});

// Backend code
// API endpoint to handle updating service label in the database
app.put("/api/updateService/:id", (req, res) => {
  const { id } = req.params;
  const { label } = req.body;

  // Check if service ID and label are provided
  if (!id || !label) {
    return res.status(400).json({ error: "Invalid request" });
  }

  // Construct SQL query to update service label
  const sql = "UPDATE services SET label = ? WHERE id = ?";

  // Execute the SQL query
  pool.query(sql, [label, id], (err, result) => {
    if (err) {
      console.error("Error updating service:", err);
      return res.status(500).json({ error: "Failed to update service" });
    }
    console.log("Service updated successfully");
    res.json({ message: "Service updated successfully" });
  });
});

// Update theme the status of a room
app.put("/api/updateThemeStatus", async (req, res) => {
  try {
    // Extract isActive and roomId from the request body
    const { isActive } = req.body;

    // Update the status of rooms in the database
    pool.query("UPDATE admin SET theme = ? WHERE id = 1", [isActive]);

    // Send a success response to the client
    res.status(200).json({ message: "Status updated successfully" });
  } catch (error) {
    // Log the error and send an error response to the client
    console.error("Failed to update status:", error);
    res.status(500).json({ error: "Failed to update status" });
  }
});

app.get("/api/getThemeStatus", async (req, res) => {
  const sql = "SELECT theme from admin where id = 1";

  pool.query(sql, (err, result) => {
    if (err) {
      console.log("Error fetching theme status");
      res.status(500).send("Error fetching theme status");
      return;
    }
    // console.log("Theme status fetched successfully",result);
    res.send(result);
  });
});

app.get("/api/getRoomTypes", async (req, res) => {
  const sql = "SELECT room_type FROM rooms ";
  pool.query(sql, (err, result) => {
    if (err) {
      console.log("Error fetching Room types ");
      res.status(500).send("Error fetching Room types");
      return;
    }
    console.log("Room types fetched succeefully", result);
    // Extract room types from the result array
    const RoomTypes = result.map((row) => row.room_type);

    console.log("Room types fetched successfully: ", RoomTypes);

    // Send the room types array as the response
    res.json(RoomTypes);
  });
});

app.put("/api/updateRoomType/:id", (req, res) => {
  const { id } = req.params;
  const { occupancy, available, price, tax } = req.body;

  // Check if occupancy, available, price, and tax are provided
  if (!occupancy || !available || !price || !tax) {
    return res
      .status(400)
      .json({ error: "Occupancy, available, price, and tax are required" });
  }

  // Construct SQL query to update the room type
  const sql =
    "UPDATE rooms SET no_of_rooms = ?, currently_available = ?, price = ?, tax = ? WHERE id = ?";

  // Execute the SQL query
  pool.query(sql, [occupancy, available, price, tax, id], (err, result) => {
    if (err) {
      console.error("Error updating room type:", err);
      return res.status(500).json({ error: "Failed to update room type" });
    }
    console.log("Room type updated successfully");
    res.json({ message: "Room type updated successfully" });
  });
});

// Define a route to handle adding a new room type
app.post("/api/addRoomType", (req, res) => {
  const { newRoomType } = req.body;

  // Check if newRoomType is provided
  if (!newRoomType) {
    return res.status(400).json({ error: "New room type is required" });
  }

  // Construct SQL query to insert the new room type
  const sql = "INSERT INTO rooms (room_type) VALUES (?)";

  // Execute the SQL query
  pool.query(sql, [newRoomType], (err, result) => {
    if (err) {
      console.error("Error adding new room type:", err);
      return res.status(500).json({ error: "Failed to add new room type" });
    }
    console.log("New room type added successfully");
    res.json({ message: "New room type added successfully" });
  });
});

// Saving expenses route
app.post("/api/save-expenses", (req, res) => {
  const { bookingId, expenses } = req.body;

  // Check if bookingId and expenses are provided
  if (!bookingId || !expenses) {
    return res
      .status(400)
      .json({ error: "Booking ID and expenses are required" });
  }

  // Convert expenses array to JSON string
  const formattedExpenses = JSON.stringify(expenses);

  // Construct SQL query to update expenses for the specified bookingId
  const sql = "UPDATE bookings SET expenses = ? WHERE id = ?";

  // Execute the SQL query
  pool.query(sql, [formattedExpenses, bookingId], (err, result) => {
    if (err) {
      console.error("Error updating expenses:", err);
      return res.status(500).json({ error: "Failed to update expenses" });
    }
    console.log("Expenses updated successfully");
    res.json({ message: "Expenses updated successfully" });
  });
});
// Retrieving expenses route
// Retrieving expenses route
app.get("/api/get-expenses/:bookingId", (req, res) => {
  const { bookingId } = req.params;

  // Construct SQL query to select expenses data for the given booking ID
  const sql = "SELECT expenses FROM bookings WHERE id = ?";

  // Execute the SQL query
  pool.query(sql, [bookingId], (err, result) => {
    if (err) {
      console.error("Error retrieving expenses:", err);
      return res
        .status(500)
        .json({ error: "Failed to retrieve expenses data" });
    }

    // Check if expenses data exists for the given booking ID
    if (result.length === 0 || !result[0].expenses) {
      return res
        .status(404)
        .json({ error: "Expenses data not found for the given booking ID" });
    }

    // Parse and send expenses data as JSON
    const expenses = JSON.parse(result[0].expenses);
    res.json({ expenses });
  });
});

app.get("/api/fetchBookingDetails/:bookingId", (req, res) => {
  const bookingId = req.params.bookingId;
  const query = "SELECT * FROM bookings WHERE id = ?"; // Replace 'bookings' with your actual table name
  pool.query(query, [bookingId], (err, rows) => {
    if (err) {
      console.error("Error executing MySQL query:", err);
      return res.status(500).json({ error: "Internal Server Error" });
    }

    if (rows.length === 0) {
      // If no booking found with the provided ID, return 404 Not Found
      return res.status(404).json({ error: "Booking not found" });
    }

    res.json(rows[0]); // Assuming there's only one booking with the provided ID
  });
});

// Define storage for multer
const serviceImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const destinationFolder = "./uploads/serviceimages";
    fs.mkdirSync(destinationFolder, { recursive: true });
    cb(null, destinationFolder);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now(); // Get current timestamp
    const fileName = `${timestamp}_${file.originalname}`; // Append timestamp to filename
    cb(null, fileName);
  },
});

// Use multer with the defined storage for service images
const serviceImageUpload = multer({ storage: serviceImageStorage });

// Handle service image upload
// Handle service image upload/update
app.post(
  "/uploadServiceImage",
  serviceImageUpload.single("image"),
  async (req, res) => {
    try {
      // Check if file is uploaded successfully
      if (!req.file) {
        return res.status(400).json({ error: "No image uploaded" });
      }

      const imageUrl = `/uploads/serviceimages/${req.file.filename}`;
      const serviceId = req.query.serviceId; // Retrieve service ID from the query parameters

      // Update service image URL in the database for the corresponding service ID
      pool.query(
        "UPDATE services SET picture = ? WHERE id = ?",
        [imageUrl, serviceId],
        (error, results) => {
          if (error) {
            console.error("Error updating service image:", error);
            return res.status(500).json({
              error: "Internal Server Error",
              details: error.message,
            });
          }
          // Check if the service was updated successfully
          if (results.affectedRows === 0) {
            return res.status(404).json({ error: "Service not found" });
          }
          console.log("Service image updated successfully:", imageUrl);
          res.json({
            success: true,
            message: "Service image updated successfully",
          });
        }
      );
    } catch (error) {
      console.error("Error uploading service image:", error);
      res
        .status(500)
        .json({ error: "Internal Server Error", details: error.message });
    }
  }
);

// Handle updating service image
app.put(
  "/updateServiceImage/:serviceId",
  serviceImageUpload.single("image"),
  async (req, res) => {
    const { serviceId } = req.params;

    try {
      // Ensure that a file was uploaded
      if (!req.file) {
        return res.status(400).json({ error: "No image file uploaded" });
      }

      // Construct the new relative image URL
      const updatedImageUrl = `/uploads/serviceimages/${req.file.filename}`;

      // Update the image URL in the database
      pool.query(
        "UPDATE services SET picture = ? WHERE id = ?",
        [updatedImageUrl, serviceId],
        (error, results) => {
          if (error) {
            console.error("Error updating service image:", error);
            return res.status(500).json({
              error: "Internal Server Error",
              details: error.message,
            });
          }
          res.status(200).json({
            success: true,
            message: "Service image updated successfully",
          });
        }
      );
    } catch (error) {
      console.error("Error updating service image:", error);
      res
        .status(500)
        .json({ error: "Internal Server Error", details: error.message });
    }
  }
);

// API Route to delete service image
app.delete("/api/deleteServiceImage", async (req, res) => {
  try {
    const { serviceId } = req.query;

    // First, fetch the image URL from the database
    pool.query(
      "SELECT picture FROM services WHERE id = ?",
      [serviceId],
      async (error, results) => {
        if (error) {
          console.error("Error fetching service image URL:", error);
          return res.status(500).json({
            error: "Internal Server Error",
            details: error.message,
          });
        }

        const imageUrl = results[0]?.picture; // Use optional chaining to handle undefined or null

        if (!imageUrl) {
          console.error("Image URL not found for service ID:", serviceId);
          return res.status(404).json({
            error: "Image URL not found",
            details: "No image URL found for the specified service ID",
          });
        }

        // Delete the image URL from the database
        pool.query(
          "UPDATE services SET picture = NULL WHERE id = ?",
          [serviceId],
          (error, results) => {
            if (error) {
              console.error("Error deleting service image URL:", error);
              return res.status(500).json({
                error: "Internal Server Error",
                details: error.message,
              });
            }

            console.log("Service image URL deleted successfully");

            const imagePath = path.join(__dirname, imageUrl);
            console.log("imagePath", imagePath);

            // Delete the corresponding image file from the file system
            fs.unlink(imagePath, (error) => {
              if (error) {
                console.error("Error deleting image file:", error);
                // Don't return an error response here since the URL has been removed from the database
              } else {
                console.log("Image file deleted successfully");
              }
            });

            res.status(200).json({
              success: true,
              message: "Service image and file deleted successfully",
            });
          }
        );
      }
    );
  } catch (error) {
    console.error("Error deleting service image:", error);
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
});

app.get("/api/getServiceImages", (req, res) => {
  // Query to fetch images and ids from the database
  const sql = "SELECT id, picture FROM services";

  pool.query(sql, (err, results) => {
    if (err) {
      console.error("Error fetching images from database:", err);
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }

    // Extract image URLs and ids from the results
    const images = results.map((result) => ({
      id: result.id,
      picture: result.picture,
    }));

    console.log("Fetched images:", images); // Logging fetched images
    res.json({ images });
  });
});

// Define storage for multer
const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const destinationFolder = "./uploads/sitelogo";
    fs.mkdirSync(destinationFolder, { recursive: true });
    cb(null, destinationFolder);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now(); // Get current timestamp
    const fileName = `${timestamp}_${file.originalname}`; // Append timestamp to filename
    cb(null, fileName);
  },
});

// Use multer with the defined storage for service images
const logoUpload = multer({ storage: logoStorage });

// Handle service image upload/update
app.post("/siteLogoUpload", logoUpload.single("image"), async (req, res) => {
  try {
    // Check if file is uploaded successfully
    if (!req.file) {
      return res.status(400).json({ error: "No image uploaded" });
    }

    // Retrieve the previous image URL from the database
    pool.query(
      "SELECT logo FROM admin WHERE id = 1",
      (error, results) => {
        if (error) {
          console.error("Error retrieving previous image URL:", error);
          return res.status(500).json({
            error: "Internal Server Error",
            details: error.message,
          });
        }
        
        // Check if a previous image URL exists
        const previousImageUrl = results.length > 0 ? results[0].logo : null;

        const imageUrl = `/uploads/sitelogo/${req.file.filename}`;

        // Update service image URL in the database for the corresponding service ID
        pool.query(
          "UPDATE admin SET logo = ? WHERE id = 1",
          [imageUrl],
          (error, results) => {
            if (error) {
              console.error("Error updating service image:", error);
              return res.status(500).json({
                error: "Internal Server Error",
                details: error.message,
              });
            }
            // Check if the service was updated successfully
            if (results.affectedRows === 0) {
              return res.status(404).json({ error: "Service not found" });
            }
            console.log("Service image updated successfully:", imageUrl);
            res.json({
              success: true,
              message: "Service image updated successfully",
            });

            // Delete the previous image file from the file system
            if (previousImageUrl) {
              const imagePath = path.join(__dirname, previousImageUrl);
              console.log("Deleting previous image:", imagePath);
              fs.unlink(imagePath, (error) => {
                if (error) {
                  console.error("Error deleting previous image file:", error);
                } else {
                  console.log("Previous image file deleted successfully");
                }
              });
            }
          }
        );
      }
    );
  } catch (error) {
    console.error("Error uploading service image:", error);
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
});

app.get("/api/fetchSiteLogo", (req, res) => {
  // Query to fetch the logo URL from the database
  const sql = "SELECT logo FROM admin WHERE id = 1"; // Assuming the logo is stored in the admin table with id 1

  pool.query(sql, (err, results) => {
    if (err) {
      console.error("Error fetching logo from database:", err);
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }

    // Check if any results were returned
    if (!results || results.length === 0 || !results[0].logo) {
      console.log("No logo found in the database");
      res.status(404).json({ error: "Logo not found" });
      return;
    }

    // Extract the logo URL from the result
    const logoUrl = results[0].logo;

    console.log("Fetched logo URL:", logoUrl); // Logging fetched logo URL
    res.json({ logo: logoUrl });
  });
});


app.get("/api/monthlydata", (req, res) => {
  const sql = `
    SELECT 
      DATE_FORMAT(STR_TO_DATE(check_in, '%a %b %d %Y'), '%b %Y') as month, 
      SUM(paid_amount) as earnings, 
      COUNT(*) as bookings
    FROM bookings
    WHERE check_in IS NOT NULL
    GROUP BY YEAR(STR_TO_DATE(check_in, '%a %b %d %Y')), MONTH(STR_TO_DATE(check_in, '%a %b %d %Y'))
    ORDER BY YEAR(STR_TO_DATE(check_in, '%a %b %d %Y')), MONTH(STR_TO_DATE(check_in, '%a %b %d %Y'));
  `;
  pool.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching monthly data:", err);
      res.status(500).send("Error fetching monthly data");
      return;
    }
    console.log("Monthly data fetched successfully:", result);
    res.json(result);
  });
});

// API code to fetch room type statistics

app.get("/api/roomtypestats", (req, res) => {
  const sql = `
    SELECT
      SUBSTRING_INDEX(room_type, ' - ', 1) AS roomType,
      SUM(SUBSTRING_INDEX(room_type, ' - ', -1)) AS bookings
    FROM bookings
    WHERE room_type IS NOT NULL
    GROUP BY roomType;
  `;

  pool.query(sql, (err, result) => {
    if (err) {
      console.error("Error fetching room type stats:", err);
      res.status(500).send("Error fetching room type stats");
      return;
    }

    // Filter out entries with roomType as 'Luxury Room, Single Room' or 'undefined'
    const filteredResult = result.filter(item => 
      item.roomType !== 'Luxury Room, Single Room' && item.roomType !== 'undefined' && item.roomType !== ''
    );

    // Calculate total bookings
    const totalBookings = filteredResult.reduce((acc, curr) => acc + curr.bookings, 0);

    // Format room types and calculate percentage
    const roomTypeStats = filteredResult.map(item => ({
      roomType: item.roomType,
      bookings: item.bookings,
      percentage:  Math.round((item.bookings / totalBookings) * 100),
    }));

    console.log("Room type stats fetched successfully:", roomTypeStats);
    res.json(roomTypeStats);
  });
});



app.get("/", (req, res) => {
  res.send("Hello, World!");
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
