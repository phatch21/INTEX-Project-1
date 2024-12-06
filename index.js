const express = require("express");
const session = require('express-session');
const bcrypt = require('bcrypt');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const app = express();
let path = require("path");
const port = process.env.PORT || 3000;

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

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
        host: process.env.RDS_HOSTNAME || "localhost",//"awseb-e-vfbtv3p32z-stack-awsebrdsdatabase-jjafz3q7a3js.cv2g6ywg6824.us-east-1.rds.amazonaws.com", 
        user: process.env.RDS_USERNAME || "postgres", // PostgreSQL user with access to the database.
        password: process.env.RDS_PASSWORD || "matt3j145367",//"supersecretpassword", // Password for the PostgreSQL user.
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
    req.session.isLoggedIn = false;
    res.render('login');
});

// Handling a login POST request
app.post('/login', async (req, res) => {
    //const { token } = req.body; // The TOTP token entered by the user
    const username = req.body.username;
    const password = req.body.password; // Plain-text password from the user
    const token = req.body.token;
 
    try {
        // Fetch the admin user from the database
        const admin = await knex.select('admin_id', 'username', 'password', 'fname', 'secret') // Include 'admin_id' and 'fname'
            .from('admin')
            .where('username', username)
            .first();
 
        if (admin) {
            // Use bcrypt.compare() to check the password
            const isPasswordMatch = await bcrypt.compare(password, admin.password);

            // Step 2: Validate the TOTP token
            const isTokenValid = speakeasy.totp.verify({
                secret: admin.secret, // TOTP secret stored in the database
                encoding: 'base32',
                token, // The TOTP token provided by the user
                window: 5, // Allow for slight clock drift (set to 1 when not in testing)
            });

            if (!isTokenValid) {
                return res.status(401).json({ error: 'Invalid TOTP token.' });
            }
           
            if (isPasswordMatch) {
                // Password matches, log in the user
                req.session.isLoggedIn = true;
 
                // Store the admin's ID and first name in the session for later use
                req.session.admin = {
                    admin_id: admin.admin_id,
                    fname: admin.fname
                };

                // Redirect to the admin page
                res.redirect('/admin');
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

app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).send('Failed to log out');
        }
        // Redirect to the login page or home page after logging out
        res.redirect('/'); // Adjust this as needed
    });
});

// Route to generate a TOTP secret
app.get('/generate-secret', isAuthenticated, (req, res) => {
    const result = {secret : ""};
    res.render('generate-secret', { result });
});

app.post('/generate-secret', async (req, res) => {
    try {
        const username = req.body.username;

        console.log("Username received:", username); // Log the username

        if (!username) {
            return res.status(400).json({ error: "Username is required." });
        }

        // Query the database
        const result = await knex('admin')
            .select('secret')
            .where('username', username)
            .first();

        if (!result || !result.secret) {
            return res.status(404).json({ error: "No secret found for the provided username." });
        }

        res.render('generate-secret', { result });

    } catch (error) {
        console.error('Error fetching secret:', error);
        res.status(500).json({ error: 'Failed to fetch TOTP secret.' });
    }
});

// Admin route protected by isAuthenticated middleware
app.get('/admin', isAuthenticated, (req, res) => {
    const admin = req.session.admin;
   
    knex('admin')
        .select('admin_id', 'fname')
        .then(admins => {
            // Render the admin.ejs template and pass the admin data
            res.render('admin', { admins, loggedInAdmin: admin });
        })
        .catch(error => {
            console.error('Error querying database:', error);
            res.status(500).send('Internal Server Error');
        });
});

app.get("/sponsors", (req, res) => {
    res.render("sponsors");
});

app.get('/createAdmin', isAuthenticated, (req, res) => {
    res.render('createAdmin');
});

app.post('/createAdmin', async (req, res) => {
    try {
        const hashedPassword = await hashPassword(req.body.password); // Hash the password

        // Generate TOTP secret
        const secret = speakeasy.generateSecret({ name: 'TurtleShelterProject' });

        // Insert new admin into the database
        await knex("admin").insert({
            fname: req.body.fname.toUpperCase(),
            lname: req.body.lname.toUpperCase(),
            username: req.body.username,
            password: hashedPassword, // Store the hashed password
            secret: secret.base32, // Store the TOTP secret
        });

        // Redirect to the admin control panel
        res.redirect('/generate-secret');
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
            'admin_id'
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

app.get('/createTeamMember', isAuthenticated, (req, res) => {
    res.render('createTeamMember');
});

app.post('/createTeamMember', async (req, res) => {
    try {
        // Insert new team member into the database
        await knex("teammember").insert({
            firstname: req.body.fname.toUpperCase(),
            lastname: req.body.lname.toUpperCase(),
            phone: req.body.phone,
            email: req.body.email,
            address: req.body.address,
            city: req.body.city,
            state: req.body.state,
            zip: req.body.zip
        });

        // Redirect to the admin control panel
        res.redirect('/admin');
    } catch (err) {
        console.error('Database Error:', err);
        res.status(500).json({ error: 'Failed to insert admin into database.' });
    }
});

app.get('/maintainTeamMember', isAuthenticated, (req, res) => {
    knex('teammember')
        .select(
            'teammemberid',
            'firstname',
            'lastname',
            'phone',
            'email',
            'address',
            'city',
            'state',
            'zip'
        )
        //returns all the records as an ARRAY of ROWS
        .then(teammembers => {
            // Render the index.ejs template and pass the data
            res.render('maintainTeamMember', { teammembers });
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
    const willlead = req.body.willlead === 'true';
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
        willlead: willlead,
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

// Gets the event request page
app.get('/eventRequest', (req, res) => {
    res.render('eventRequest');
});

// Posts the event request page to the database
app.post('/eventRequest', async (req, res) => {
    const fname = req.body.fname;
    const lname = req.body.lname;
    const email = req.body.email;
    const phone = req.body.phone;
    const address = req.body.address;
    const city = req.body.city;
    const state = req.body.state;
    const zip = req.body.zip;
    const eventname = req.body.eventname;
    const activity = req.body.activity;
    const jenstory = req.body.jenstory
    const estattendance = req.body.estNumAttendance;
    const numDates = req.body.numDates;

    try {
        // Step 1: Check if the organizer already exists, return organizerid
        let organizer = await knex('organizer').where("email", req.body.email).first();
        let organizerId;
    
        if (!organizer) {
            // Insert new organizer and retrieve organizerid
            const [newOrganizer] = await knex('organizer')
                .insert({
                    firstname: fname,
                    lastname: lname,
                    email: email,
                    phone: phone
                })
                .returning('organizerid'); // Returns an array of the inserted rows
            organizerId = newOrganizer.organizerid;
        } else {
            // Existing organizer found
            organizerId = organizer.organizerid;
        }
    
        // Step 2: Check if the location already exists
        let location = await knex('location').where({ address, city, state, zip }).first();
        let locationId;
    
        if (!location) {
            // Insert new location
            await knex('location').insert({
                address: address,
                city: city,
                state: state,
                zip: zip
            });
        
            // Fetch the location ID of the newly inserted row
            const newLocation = await knex('location')
                .where({ address, city, state, zip })
                .first();
        
            locationId = newLocation?.locationid;        
        } else {
            // Existing location found
            locationId = location.locationid;
        }
    
        // Step 3: Insert into the "event" table
        const [eventId] = await knex('event')
            .insert({
                organizerid: organizerId,
                locationid: locationId,
                eventname: eventname,
                eventstatus: 'Requested',
                activity: activity,
                jenstory: jenstory,
                estattendance: estattendance,
                numvoluntest: 0,
                participantsreal: null,
                volunteersreal: null,
            })
            .returning('eventid');

        // Step 4: Create an entry for the production table
        for (let i = 1; i <= 5; i++) {
            await knex('production')
                .insert({
                    eventid: eventId.eventid,
                    itemnum: i,
                    numproduced: 0,
                })
                .returning('eventid');
            }
    
        // Step 4: Insert into the "schedule" table for multiple dates
        for (let i = 1; i <= numDates; i++) {
            // Access the dynamic keys from req.body
            const eventDateKey = `date${i}`;
            const startTimeKey = `startTime${i}`;
            const endTimeKey = `endTime${i}`;
        
            const eventDate = req.body[eventDateKey];
            const startTime = req.body[startTimeKey];
            const endTime = req.body[endTimeKey];
        
            // Validate and format the event date
            let insertDate;
            try {
                insertDate = new Date(eventDate);
                if (isNaN(insertDate)) throw new Error(`Invalid date: ${eventDate}`);
                insertDate = insertDate.toISOString().split('T')[0]; // Format as YYYY-MM-DD
            } catch (error) {
                console.error(`Error processing date for ${eventDateKey}:`, error);
                continue; // Skip this iteration for invalid dates
            }
        
            // Insert the schedule entry
            try {
                await knex('schedule').insert({
                    eventid: eventId.eventid, // Assuming eventId is an object with eventid property
                    event_date: insertDate, // Already validated and formatted
                    start_time: startTime, // Pass raw value; PostgreSQL will handle time format
                    end_time: endTime, // Pass raw value; PostgreSQL will handle time format
                });
            } catch (error) {
                console.error(`Error inserting schedule entry for date ${eventDateKey}:`, error);
            }
        }

        res.redirect('/');
    } catch (error) {
        console.error('Error processing event request:', error);
        res.status(500).send({ success: false, message: 'Internal Server Error' });
    } 
});

// Gets the list of event organizers and displays
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

//get info from databse so it shows up when edit is clicked
app.get('/editAdmin/:admin_id', isAuthenticated, (req, res) => {
    const admin_id = parseInt(req.params.admin_id, 10);
    if (isNaN(admin_id)) {
        return res.status(400).send('Invalid admin_id');
    }
    knex('admin')
        .where('admin_id', admin_id)
        .first()
        .then(admin => {
            if (!admin) {
                return res.status(404).send('Admin not found');
            }
            res.render('editAdmin', { admin });
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

//get info from databse so it shows up when edit is clicked
app.get('/editTeamMember/:teammemberid', isAuthenticated, (req, res) => {
    const teammemberid = req.params.teammemberid;
    if (isNaN(teammemberid)) {
        return res.status(400).send('Invalid team member ID');
    }
    knex('teammember')
        .where('teammemberid', teammemberid)
        .first()
        .then(teammember => {
            if (!teammember) {
                return res.status(404).send('Team Member not found');
            }
            res.render('editTeamMember', { teammember });
        })
        .catch(error => {
            console.error('Error querying database:', error);
            res.status(500).send('Internal Server Error');
        });
});

//Replaced info in admin table w/edits
app.post('/editTeamMember/:teammemberid', (req, res) => {
    const teammemberid = req.params.teammemberid
    const email = req.body.email;
    const fname = req.body.fname.toUpperCase();
    const lname = req.body.lname.toUpperCase();
    const phone = req.body.phone;
    const address = req.body.address;
    const city = req.body.city;
    const state = req.body.state;
    const zip = req.body.zip;

    knex('teammember')
        .where('teammemberid', teammemberid)
        .first()
        .update({
        firstname: fname,
        lastname: lname,
        email: email,
        phone: phone,
        address: address,
        city: city,
        state: state,
        zip: zip
        })
        .then(() => {
        res.redirect('/maintainTeamMember'); // Redirect to the list of Team Members after saving
        })
        .catch(error => {
        console.error('Error updating Team Member:', error);
        res.status(500).send('Internal Server Error');
    });
});

//Deletes team member
app.post('/deleteTeamMember/:teammemberid', (req, res) => {
    const teammemberid = req.params.teammemberid;
    knex('teammember')
            .where('teammemberid', teammemberid)
            .del() // Deletes the record with the specified ID
            .then(() => {
            res.redirect('/maintainTeamMember'); // Redirect to the maintainAdmin list after deletion
        }).catch(error => {
            console.error('Error deleting Team Member:', error);
            res.status(500).send('Internal Server Error');
    });
});

app.get('/displayEvents', isAuthenticated, (req, res) => {
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

app.get('/displayVolunteers', isAuthenticated, (req, res) => {
    knex('volunteer')
        .select(
            'volunteerid',
            'firstname',
            'lastname',
            'email',
            'phone',
            'willinghours',
            'heardhow',
            'cansew',
            'willlead',
            'willteach',
            'havemachine'
        )
        //renders index.js
        .then(volunteer => {
            // Render the index.ejs template and pass the data
            res.render('displayVolunteers', { volunteer });
        })
        .catch(error => {
            console.error('Error querying database:', error);
            res.status(500).send('Internal Server Error');
        });
});
 
app.get('/viewEvent/:eventid', async (req, res) => {
    const eventId = req.params.eventid;

    try {
        // Query the database for event details
        const eventData = await knex('event')
            .join('schedule', 'event.eventid', '=', 'schedule.eventid')
            .join('location', 'event.locationid', '=', 'location.locationid')
            .join('organizer', 'event.organizerid', '=', 'organizer.organizerid')
            .select(
                'event.*',
                'schedule.event_date',
                'schedule.start_time',
                'schedule.end_time',
                'location.address',
                'location.city',
                'location.state',
                'location.zip',
                'organizer.firstname',
                'organizer.lastname',
                'organizer.phone',
                'organizer.email'
            )
            .where('event.eventid', eventId);

        if (!eventData || eventData.length === 0) {
            return res.status(404).send('Event not found');
        }

        // Extract and format schedule details
        const scheduleDetails = eventData.map(row => ({
            event_date: row.event_date,
            start_time: row.start_time,
            end_time: row.end_time,
        }));

        // Pass the data to the view
        res.render('viewEvent', {
            event: {
                ...eventData[0], // Pass the first row of event details
                scheduleDetails, // Include schedule details
            },
        });
    } catch (error) {
        console.error('Error querying database:', error);
        res.status(500).send('Internal Server Error');
    }
});

 
app.post('/viewEvent/:eventid', (req, res) => {
    const eventid = req.params.eventid;
    const eventname = req.body.eventname;
    const firstname = req.body.firstname;
    const lastname = req.body.lastname;
    const phone = req.body.phone;
    const email = req.body.email;
    const address = req.body.address;
    const city = req.body.city;
    const state = req.body.state;
    const zip = req.body.zip;
    const activity = req.body.activity;
    const jenstory = req.body.jenstory;
    const estattendance = req.body.estattendance;
    const numvoluntest = req.body.numvoluntest;
    const participantsreal = req.body.participantsreal;
    const volunteersreal = req.body.volunteersreal;
    const eventstatus = req.body.eventstatus;
    const organizerid = req.body.organizerid;
    const locationid = req.body.locationid;
    let itemnum = [];
    itemnum.push(req.body.pockets);
    itemnum.push(req.body.collars);
    itemnum.push(req.body.envelopes);
    itemnum.push(req.body.vestPiece);
    itemnum.push(req.body.completedProduct);
 
    console.log(itemnum);
 
    // Update the event in the database
    knex('event')
        .where('event.eventid', eventid)  // Ensure correct column and value
        .join('schedule', 'event.eventid', '=', 'schedule.eventid')
        .join('location', 'event.locationid', '=', 'location.locationid')
        .join('organizer', 'event.organizerid', '=', 'organizer.organizerid')
        .join('production', 'event.eventid', '=', 'production.eventid')
        .join('items', 'items.itemnum', '=', 'production.itemnum')
        .update({
            eventname: eventname,
            activity: activity,
            jenstory: jenstory,
            estattendance: estattendance,
            numvoluntest: numvoluntest,
            participantsreal: participantsreal,
            volunteersreal: volunteersreal,
            eventstatus: eventstatus,
        })
        .then(() => {
            // Step 2: Update the organizer table (only if `organizerid` exists)
            return knex('organizer')
                .where('organizer.organizerid', organizerid)  // Use organizerid from req.body
                .update({
                    firstname: firstname,
                    lastname: lastname,
                    phone: phone,
                    email: email,
                });
        })
        .then(() => {
            // Step 3: Update the location table
            return knex('location')
                .where('location.locationid', locationid)
                .update({
                    address: address,
                    city: city,
                    state: state,
                    zip: zip,
                });
        })
        .then(() => {
            // Step 4: Update the production table for each product
            let updates = []; // Array to hold all promises
            for (let iCount = 0; iCount < 5; iCount++) {
                let iNum = iCount + 1;
                updates.push(
                    knex('production')
                        .where('production.eventid', eventid)
                        .andWhere('production.itemnum', iNum)
                        .update({
                            numproduced: itemnum[iCount]
                        })
                );
            }
 
            // Wait for all updates to complete
            return Promise.all(updates)
                .then(() => {
                    console.log('All rows updated successfully!');
                })
                .catch(err => {
                    console.error('Error updating rows:', err);
                });
        })         
        .then(() => {
            
            res.redirect('/displayEvents'); // Redirect after successful update
        })
        .catch(error => {
            console.error('Error updating Event:', error);
            res.status(500).send('Internal Server Error');
        });     
});

//Deletes event
app.post('/deleteEvent/:eventid', async (req, res) => {
    const eventid = req.params.eventid;

    try {
        // Execute all deletions in parallel
        await Promise.all([
            knex('schedule').where('eventid', eventid).del(),
            knex('eventvolunteers').where('eventid', eventid).del(),
            knex('production').where('eventid', eventid).del(),
            knex('teamevent').where('eventid', eventid).del(),
        ]);

        // Delete the main event record after related records
        await knex('event').where('eventid', eventid).del();

        // Send a single response after all operations are successful
        res.redirect('/displayEvents');
    } catch (error) {
        console.error('Error deleting event:', error);

        // Send an error response if something fails
        res.status(500).send('Internal Server Error');
    }
});

app.get('/jensStory', (req, res) => {
    res.render('jensStory');
});

app.get('/about', (req, res) => {
    res.render('about');
});

app.get('/vestsDistributed', (req, res) => {
    res.render('vestsDistributed');
});

app.get('/sponsors', (req, res) => {
    res.render('sponsors');
});

app.get('/donations', (req, res) => {
    res.render('donations');
});

app.get('/distribution', (req, res) => {
    res.render('distribution')
});

app.post('/distribution', async (req, res) => {
    const eventDate = req.body.eventDate;
    const fname = req.body.firstname.toUpperCase();
    const lname = req.body.lastname.toUpperCase();
    const email = req.body.email;
    const city = req.body.city;
    const state = req.body.state;
    const size = req.body.size;
    const gender = req.body.gender;

    console.log(gender, size);

    await knex("distribution").insert({
        receiverfirstname: fname,
        receiverlastname: lname,
        location: city,
        state: state, // Store the hashed password
        date: eventDate, // Store the TOTP secret
        size: size,
        gender: gender
    }).then(() => {
        res.redirect('/distribution'); // Redirect after successful update
    })
    .catch(error => {
        console.error('Error updating distribution:', error);
        res.status(500).send('Internal Server Error');
    });     
});

// Start the server
app.listen(port, () => console.log(`INTEX website is listening on port ${port}`));