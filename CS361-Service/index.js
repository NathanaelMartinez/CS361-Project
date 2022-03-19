const express = require('express');
const app = express();
const dotenv = require('dotenv');
const mongoose = require('mongoose')

// Import Routes
const authRoute = require('./routes/auth');
const { application } = require('express');

dotenv.config();

// Connect to Database
mongoose.connect(process.env.DB_CONNECT,
    (err) => {
        if(err){
            console.log(err)
        }else{
            console.log("MongoDB is connected");
        }
    }
);

// Homepage Description
app.get('/',function(req,res){
    res.send('Welcome to Nathanael Martinez\' authentication API. Here you can use the /api/user/register route to register your users with an email, username, and password in your post body and then use the /api/user/login route to create a JWT that will allow you to verify whether or not a user should have access to certain routes.');
});

// Middleware
app.use(express.json());
// Route Middlewares 
app.use('/api/user', authRoute);

app.listen(process.env.PORT || 1471);