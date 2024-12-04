const express = require("express");
const session = require('express-session');
const bcrypt = require('bcrypt');
const app = express();
let path = require("path");
const port = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Middleware
app.use(express.urlencoded({ extended: true }));

// Middleware for sessions
app.use(session({
    secret: 'supersecretkey', // Change to a secure secret key
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
        host: process.env.RDS_HOSTNAME || "localhost", // Host where the PostgreSQL server is running.
        user: process.env.RDS_USERNAME || "postgres", // PostgreSQL user with access to the database.
        password: process.env.RDS_PASSWORD || "supersecretpassword", // Password for the PostgreSQL user.
        database: process.env.RDS_DB_NAME || "ebdb", // Database name.
        port: process.env.RDS_PORT || 5432, // Default port for PostgreSQL.
        ssl: process.env.DB_SSL ? {rejectUnauthorized : false} : false
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
app.post('/login', async (req, res) => {
    const username = req.body.username;
    const password = req.body.password; // Plain-text password from the user

    try {
        // Fetch the admin user from the database
        const admin = await knex.select("username", "password")
            .from("admin")
            .where("username", username)
            .first();

        if (admin) {
            // Use bcrypt.compare() to check the password
            const isPasswordMatch = await bcrypt.compare(password, admin.password);
            
            if (isPasswordMatch) {
                // Password matches, log in the user
                req.session.isLoggedIn = true;
                res.redirect('/admin'); // Redirect to the admin page
            } else {
                // Password doesn't match
                res.status(401).send('Invalid username or password');
            }
        } else {
            // Username not found
            res.status(401).send('Invalid username or password');
        }
    } catch (err) {
        console.error('Error during login:', err);
        res.status(500).send('An error occurred while processing your request');
    }
});

// Admin route protected by isAuthenticated middleware
app.get('/admin', isAuthenticated, (req, res) => {
    res.render('admin');
});

app.get('/createAdmin', isAuthenticated, (req, res) => {
    res.render('createAdmin');
});

app.get('/eventOrganizers', (req, res) => {
    knex('organizer')
      .select(
        'organizer.organizerid',
        'organizer.firstname',
        'organizer.lastname',
        'organizer.email',
        'organizer.phone'
      )
      .then(organizers => {
        // Render the eventOrganizers.ejs template and pass the data
        res.render('eventOrganizers', { organizers });
      })
      // allow it to die gracefully
      .catch(error => {
        console.error('Error querying database:', error);
        res.status(500).send('Internal Server Error');
      });
  });

app.post('/createAdmin', async (req, res) => {
    try {
        const hashedPassword = await hashPassword(req.body.password); // Hash the password
        await knex("admin").insert({
            fname: req.body.fname.toUpperCase(),
            lname: req.body.lname.toUpperCase(),
            username: req.body.username,
            password: hashedPassword // Store the hashed password
        });
        res.redirect('/maintainAdmin');
    } catch (err) {
        console.error('Database Error:', err);
        res.status(500).json({ error: 'Failed to insert admin into database.' });
    }
});

app.get('/maintainAdmin', isAuthenticated, (req, res) => {
    knex('admin')
        .select(
            'fname',
            'lname',
            'username',
            'adminid'
        )
       
        //returns all the records as an ARRAY of ROWS
        .then(admins => {
            // Render the index.ejs template and pass the data
            res.render('maintainAdmin', { admins });
        })
        .catch(error => {
        console.error('Error querying database:', error);
        res.status(500).send('Internal Server Error');
        });
});

app.get('/addVolunteer', (req, res) => {
    res.render('volunteerSignup');
});

// Allow volunteers to sign up
app.post('/addVolunteer', (req, res) => {
    const firstname = req.body.firstname;
    const lastname = req.body.lastname;
    const email = req.body.email;
    const phone = req.body.phone;
    const willinghours = req.body.willinghours;
    const heardhow = req.body.heardhow;
    const cansew = req.body.cansew === 'true';
    const willteach = req.body.willteach === 'true';
    const havemachine = req.body.havemachine === 'true';
    knex('volunteer')
    .insert({
        firstname: firstname.toUpperCase(),
        lastname: lastname.toUpperCase(),
        email: email,
        phone: phone,
        willinghours: willinghours,
        heardhow: heardhow,
        cansew: cansew,
        willteach: willteach,
        havemachine: havemachine,
    })
    .then(() => {
        res.redirect('/'); // Redirect after successful insertion
    })
    .catch(error => {
        console.error('Error adding Volunteer:', error);
        res.status(500).send('Internal Server Error');
    });
});

app.get('/eventRequest', (req, res) => {
    res.render('eventRequest');
});

app.get('/eventOrganizers', isAuthenticated, (req, res) => {
    knex('organizer')
      .select(
        'organizer.organizerid',
        'organizer.firstname',
        'organizer.lastname',
        'organizer.email',
        'organizer.phone'
      )
      .then(organizers => {
        // Render the eventOrganizers.ejs template and pass the data
        res.render('eventOrganizers', { organizers });
      })
      // allow it to die gracefully
      .catch(error => {
        console.error('Error querying database:', error);
        res.status(500).send('Internal Server Error');
      });
  });

  //get info from databse so it shows up when edit it clicked
app.get('/editAdmin/:admin_id', isAuthenticated, (req, res) => {
    const admin_id = parseInt(req.params.admin_id, 10);
    if (isNaN(admin_id)) {
        return res.status(400).send('Invalid admin_id');
    }
    knex('admin')
        .where('admin_id', admin_id)
        .first()
        .then(admins => {
            if (!admins) {
                return res.status(404).send('Admin not found');
            }
            res.render('editAdmin', { admins });
        })
        .catch(error => {
            console.error('Error querying database:', error);
            res.status(500).send('Internal Server Error');
        });
});
 
 
//Replaced info in admin table w/edits
app.post('/editAdmin/:admin_id', (req, res) => {
    const admin_id = req.params.admin_id;
    const fname = req.body.fname.toUpperCase();
    const lname = req.body.lname.toUpperCase();
    const username = req.body.username;
    knex('admin')
        .where('admin_id', admin_id)
        .first()
        .update({
        fname: fname,
        lname: lname,
        username: username
        })
        .then(() => {
        res.redirect('/maintainAdmin'); // Redirect to the list of Admin after saving
        })
        .catch(error => {
        console.error('Error updating Character:', error);
        res.status(500).send('Internal Server Error');
    });
})

//Deletes admin
app.post('/deleteAdmin/:admin_id', (req, res) => {
    const admin_id = req.params.admin_id;
    knex('admin')
            .where('admin_id', admin_id)
            .del() // Deletes the record with the specified ID
            .then(() => {
            res.redirect('/maintainAdmin'); // Redirect to the maintainAdmin list after deletion
        }).catch(error => {
            console.error('Error deleting Admin:', error);
            res.status(500).send('Internal Server Error');
    });
});

app.get('/requestedEvents', isAuthenticated, (req, res) => {
    knex('event')
        .select(
            'event.eventid',
            'event.eventname',
            'event.eventstatus',
        )
        //renders index.js
        .then(event => {
            // Render the index.ejs template and pass the data
            res.render('displayEvents', { event });
        })
        .catch(error => {
            console.error('Error querying database:', error);
            res.status(500).send('Internal Server Error');
        });
});
 
app.get('/viewEvent/:eventid', isAuthenticated, (req, res) => {
    const eventid = req.params.eventid;
    knex('event')
        .join('schedule', 'event.eventid', '=', 'schedule.eventid')
        .join('location', 'event.locationid', '=', 'location.locationid')
        .join('organizer', 'event.organizerid', '=', 'organizer.organizerid')
        .select(
            'event.eventid',
            'event.eventname',
            'event.eventstatus',
            'organizer.firstname',
            'organizer.lastname',
            'organizer.phone',
            'organizer.email',
            'schedule.event_date',
            'schedule.start_time',
            'schedule.end_time',
            'location.address',
            'location.city',
            'location.state',
            'location.zip',
            'event.estattendance',
            'event.numvoluntest',
            'event.participantsreal',
            'event.volunteersreal'
        )
        .where('event.eventid', eventid)
        .first()  // Use .first() to get only the first matching result
        .then(event => {
            if (!event) {
                return res.status(404).send('Event not found');  // Handle the case where no event is found
            }
            const formattedDate = new Date(event.event_date).toISOString().split('T')[0];
 
            res.render('viewEvent', { event: { ...event, event_date: formattedDate } });
        })
        .catch(error => {
            console.error('Error querying database:', error);
            res.status(500).send('Internal Server Error');
        });
});

// Start the server
app.listen(port, () => console.log(`INTEX website is listening on port ${port}`));
