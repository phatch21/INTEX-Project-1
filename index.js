const express = require("express");
let app = express();
let path = require("path");
const port = process.env.port || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Middleware
app.use(express.urlencoded({ extended: true }));

// Connect to the db
const knex = require("knex")({
    client: "pg", // Define the database client (PostgreSQL in this case).
    connection: { // Database connection details.
        host: process.env.RDS_HOSTNAME || "localhost", // Host where the PostgreSQL server is running.
        user: process.env.RDS_USERNAME || "postgres", // PostgreSQL user with access to the database.
        password: process.env.RDS_USERNAME || "", // Password for the PostgreSQL user.
        database: process.env.RDS_DB_NAME || "tsp_db", // Database name.
        port: process.env.RDS_PORT || 5432, // Default port for PostgreSQL.
        ssl: process.env.DB_SSL ? {rejectUnauthorized : false} : false
    }
});

// Home route
app.get("/", (req, res) => {
    knex.select().from("student").then(student => {
        res.render("index", { student: student });
    }).catch(err => {
        console.error("Database Error:", err);
        res.status(500).json({ error: "Failed to fetch students." });
    });
});

// Start the server
app.listen(port, () => console.log(`Stu website is listening on port ${port}`));