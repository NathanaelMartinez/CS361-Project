const express = require('express');
const app = express();
const dotenv = require('dotenv');
const mongoose = require('mongoose')

app.set('port', 1471);

// Import Routes
const authRoute = require('./routes/auth');

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

// Middleware
app.use(express.json());
// Route Middlewares 
app.use('/api/user', authRoute);

app.listen(app.get('port'), function(){
    console.log('App listening to port ' + app.get('port'));
});