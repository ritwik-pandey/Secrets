//jshint esversion:6
require('dotenv').config()
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const mongoose = require("mongoose");
const session = require('express-session');
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const findOrCreate = require("mongoose-findorcreate");
const FacebookStrategy = require('passport-facebook').Strategy;
const nodemailer = require('nodemailer');
const LocalStrategy = require('passport-local').Strategy;

const app = express();

app.use(express.static("public"));
app.set('view engine', 'ejs');

app.use(bodyParser.urlencoded({
    extended: true
}));

app.use(session({
    secret: "Our little Secret.",
    resave: false,
    saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

mongoose.connect("mongodb://localhost:27017/userDB", { useNewUrlParser: true, useUnifiedTopology: true });
mongoose.set('useCreateIndex', true);

const userSchema = new mongoose.Schema({
    email: {
        type: String,
    },
    password: String,
    googleId: {
        type: String,
    },
    facebookId: {
        type: String,
    },
    secret: {
        type: String,
    }
});

userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

const User = new mongoose.model("User", userSchema);

// passport.use(User.createStrategy());
passport.use(new LocalStrategy(User.authenticate()));

passport.serializeUser(function (user, done) {
    done(null, user.id);
});

passport.deserializeUser(function (id, done) {
    User.findById(id, function (err, user) {
        done(err, user);
    });
});

passport.use(new GoogleStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/secrets",
    profileFields: ['email', 'name'],
},
    function (accessToken, refreshToken, profile, cb) {
        User.findOrCreate({ googleId: profile.id }, function (err, user) {
            user.username = profile.emails[0].value;
            user.save();
            return cb(err, user);
        });
    }
));

function dupKey(username1) {

}

passport.use(new FacebookStrategy({
    clientID: process.env.APP_ID,
    clientSecret: process.env.APP_SECRET,
    callbackURL: "http://localhost:3000/auth/facebook/secrets",
    // passReqToCallback : true,
    profileFields: ['email', 'name'],
},
    function (accessToken, refreshToken, profile, cb) {
        User.findOrCreate({ facebookId: profile.id }, function (err, user) {
            user.username = profile.emails[0].value;
            user.save();
            return cb(err, user);
        });
    }
));

var email;

var otp = Math.random();
otp = otp * 1000000;
otp = parseInt(otp);

let transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    service: 'Gmail',

    auth: {
        user: 'ritwikdevelopment@gmail.com',
        pass: process.env.PASSWORD,
    }

});

app.get("/", function (req, res) {
    res.render("home");
});

app.get("/alreadyexist", function (req, res) {
    res.render("AlreadyExist");
});

app.get('/auth/google',
    passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/secrets',
    passport.authenticate('google', { failureRedirect: '/login' }),
    function (req, res) {
        // Successful authentication, redirect Secrets.
        res.redirect('/secrets');
    });

app.get('/auth/facebook',
    passport.authenticate('facebook', { scope: ['email'] }));

app.get('/auth/facebook/secrets',
    passport.authenticate('facebook', { failureRedirect: '/login' }),
    function (req, res) {
        // Successful authentication, redirect secrets.
        res.redirect('/secrets');
    });

app.get("/login", function (req, res) {
    res.render("login");
});

app.get("/register", function (req, res) {
    res.render("register");
});

app.get("/secrets", function (req, res) {
    User.find({ secret: { $ne: null } }, function (err, foundUsers) {
        if (err) {
            console.log(err);
        } else {
            if (foundUsers) {
                res.render("secrets", { userWithSecrets: foundUsers })
            }
        }
    });
});

app.get("/logout", function (req, res) {
    req.logout();
    res.redirect("/");
});

app.get("/submit", function (req, res) {
    if (req.isAuthenticated()) {
        res.render("submit");
    } else {
        res.redirect("/login");
    }
});

app.post("/alreadyexist", function (req, res) {
    res.redirect("/register");
});


app.post("/submit", function (req, res) {
    const submittedSecret = req.body.secret;
    User.findById(req.user.id, function (err, foundUser) {
        if (err) {
            console.log(err);
        } else {
            if (foundUser) {
                foundUser.secret = submittedSecret;
                foundUser.save(function () {
                    res.redirect("/secrets");
                });
            }
        }
    });
});

var usernameforregister;
var passwordforregister;

app.post("/register", function (req, res) {

    usernameforregister = req.body.username;
    passwordforregister = req.body.password;

    User.find({ username: usernameforregister }, function (err, user) {
        if (err) {
            console.log(err);
        } else {
            if (user.length > 0) {
                res.redirect("/alreadyexist");
            } else {
                var mailOptions = {
                    to: req.body.username,
                    subject: "Otp for registration is: ",
                    html: "<h3>OTP for account verification is </h3>" + "<h1 style='font-weight:bold;'>" + otp + "</h1>" // html body
                };

                transporter.sendMail(mailOptions, (error, info) => {
                    if (error) {
                        console.log(error);
                    }
                    res.render('otp', { msg: "" });

                });
            }
        }
    });

    // if(dupKey(usernameforregister) === true){
    //     console.log("I am coming here");
    //     res.redirect("/alreadyexist");
    // }else{
    //     console.log("I am coming here you");

    // }
});

app.post('/resend', function (req, res) {
    var mailOptions = {
        to: usernameforregister,
        subject: "Otp for registration is: ",
        html: "<h3>OTP for account verification is </h3>" + "<h1 style='font-weight:bold;'>" + otp + "</h1>" // html body
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log(error);
        }
        res.render('otp', { msg: "otp has been sent" });
    });

});

app.post('/verify', function (req, res) {

    if (req.body.otp == otp) {
        User.register({ username: usernameforregister }, passwordforregister, function (err, user) {
            if (err) {
                console.log(err);
                res.redirect("/register");
            } else {

                passport.use(new LocalStrategy({
                    username: usernameforregister,
                    password: passwordforregister
                },
                    function (username, password, cb) {
                        User.findOrCreate({ username: username }, function (err, user) {
                            return cb(err, user);
                        });
                    }
                ));
                res.redirect("/secrets");

            }
        });
    } else {
        res.render('otp', { msg: 'otp is incorrect' });
    }
});


app.post("/login", function (req, res) {
    const user = new User({
        username: req.body.username,
        password: req.body.password
    });

    req.login(user, function (err) {
        if (err) {
            console.log(err);
        } else {
            passport.authenticate("local")(req, res, function () {
                res.redirect("/secrets");
            });
        }
    })
});



app.listen(3000, function () {
    console.log("Server is running on port 3000.");
});