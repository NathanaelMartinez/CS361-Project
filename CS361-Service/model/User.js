const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        minLength: 6,
        maxLength: 30
    },
    email: {
        type: String,
        required: true,
        maxLength: 255,
        minLength: 6
    },
    password: {
        type: String,
        requred: true,
        maxLength: 1024,
        minLength: 6
    },
},{timestamps: true});


module.exports = mongoose.model('User', userSchema);