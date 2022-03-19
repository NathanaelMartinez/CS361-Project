const router = require('express').Router();
const User = require('../model/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const {registerValidation, loginValidation} = require('../validation');
const verify = require('./verifyToken');



// REGISTER NEW USER
router.post('/register', async (req,res) => {
    // validation check
    const { error } = registerValidation(req.body);
    if(error) return res.status(400).send(error.details[0].message);

    // check duplicate user
    const usernameExist = await User.findOne({username: req.body.username});
    if(usernameExist) return res.status(400).send('Username already exists');

    // check duplicate email
    const emailExist = await User.findOne({email: req.body.email});
    if(emailExist) return res.status(400).send('Email already exists');

    // hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(req.body.password, salt);

    // create new user
    const user = new User({
        username: req.body.username,
        email: req.body.email,
        password: hashedPassword
    });
    console.log(user);
    try {
        const savedUser = await user.save();
        res.send({user: user._id});
    } catch(err) {
        res.status(400).send(err);
        console.log(err);
    }
});

// LOGIN EXISTING USER
router.post('/login', async (req,res) => {
    // validation check
    const { error } = loginValidation(req.body);
    if(error) return res.status(400).send(error.details[0].message);
    
    // check user exists
    const user = await User.findOne({username: req.body.username});
    if(!user) return res.status(400).send('Username not found');

    // check password is correct
    const validPass = await bcrypt.compare(req.body.password, user.password);
    if(!validPass) return res.status(400).send('Invalid password');

    // create json webtoken
    const token = jwt.sign({username: user.username}, process.env.TOKEN_SECRET);
    res.header('auth-token', token).send(token);
});

// AUTHENTICATE LOGGED IN USER

router.post('/auth', async (req,res) => {
    const token = req.header('auth-token');
    if(!token) return res.status(401).send('Access Denied');

    try {
        const verified = jwt.verify(token, process.env.TOKEN_SECRET);
        res.send({user: verified});
    } catch (err) {
        res.status(400).send('Invalid Token');
    }
});



module.exports = router;