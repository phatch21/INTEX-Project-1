const express = require("express");
const session = require('express-session');
const bcrypt = require('bcrypt');
const app = express();
let path = require("path");
const port = process.env.port || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Middleware
app.use(express.urlencoded({ extended: true }));

// Middleware for sessions
app.use(session({
    secret: 'your_secret_key', // Change to a secure secret key
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Use `true` for HTTPS
}));

// Middleware to check if a user is logged in
function isAuthenticated(req, res, next) {
    if (req.session.isLoggedIn) {
        return next(); // User is logged in, proceed to the next middleware or route
    }
    res.redirect('/login'); // Redirect to login page
}

// Connect to the db
const knex = require("knex")({
    client: "pg", // Define the database client (PostgreSQL in this case).
    connection: { // Database connection details.
        host: "awseb-e-vfbtv3p32z-stack-awsebrdsdatabase-jjafz3q7a3js.cv2g6ywg6824.us-east-1.rds.amazonaws.com", // Host where the PostgreSQL server is running.
        user: process.env.RDS_USERNAME || "postgres", // PostgreSQL user with access to the database.
        password: process.env.RDS_PASSWORD || "supersecretpassword", // Password for the PostgreSQL user.
        database: process.env.RDS_DB_NAME || "intex", // Database name.
        port: process.env.RDS_PORT || 5432, // Default port for PostgreSQL.
        ssl: process.env.DB_SSL ? {rejectUnauthorized : false} : false
        // process.env.RDS_HOSTNAME ||
    }
});

// Hashing a password
async function hashPassword(password) {
    const saltRounds = 10; // Number of iterations (adjust based on your system's capacity)
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    return hashedPassword;
}

// Verifying a password
async function verifyPassword(password, hashedPassword) {
    const match = await bcrypt.compare(password, hashedPassword);
    return match; // Returns true if passwords match
}

// Home route
app.get("/", (req, res) => {
    res.render("index");
});

// Login route
app.get('/login', (req, res) => {
    res.render('login');
});

// Handling a login POST request
app.post('/login', (req, res) => {
    req.session.isLoggedIn = true; // Set session variable indicating the user is logged in
    res.redirect('/admin'); // Redirect to /admin after login
});

// Admin route protected by isAuthenticated middleware
app.get('/admin', (req, res) => {//, isAuthenticated,
    res.render('admin');
});

app.post('/createAdmin', (req, res) => {
    knex("admin").insert({
        fname: req.body.fname.toUpperCase(),
        lname: req.body.lname.toUpperCase(),
        username: req.body.username,
        password: hashPassword(req.body.password)
    }).then(() => {
        res.redirect(`/addStudentMajor/:${req.body.email}`);
    }).catch(err => {
        console.error('Database Error:', err);
        res.status(500).json({ error: 'Failed to insert student into database.' });
    });
});

app.get('/addVolunteer', (req, res) => {
    res.render('volunteerSignup');
});

// Start the server
app.listen(port, () => console.log(`INTEX website is listening on port ${port}`));