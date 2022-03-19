const express = require('express');
const mysql = require('./db-connector');

const cookieParser = require("cookie-parser");

const cheerio = require('cheerio');
const request = require('request-promise');
const axios = require('axios').default;

const app = express();
const handlebars = require('express-handlebars').create({defaultLayout:'main'});

const bookURL = 'https://apps.mymcpl.org/botb/book/browse/';

app.engine('handlebars', handlebars.engine);
app.set('view engine', 'handlebars');

app.set('port', 1470);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// cookie parser middleware
app.use(cookieParser());

app.use('/static', express.static('public'))

const apiKey = '?api_key=73c59520f5516b6c7fdc81e0971e6e24';
const baseURL = 'https://api.themoviedb.org/3';
const searchMovie = baseURL + '/search/movie' + apiKey;
const searchTV = baseURL + '/search/tv' + apiKey;


// creating 24 hours from milliseconds
const oneDay = 1000 * 60 * 60 * 24;



function getUserID(res,mysql,username){
    const myPromise = new Promise((resolve, reject) => {
        var sql = 'SELECT user_id FROM Users WHERE username = ?';
        var inserts = [username];
        mysql.pool.query(sql,inserts,function(err, results, fields){
            if(err){
                console.log(err);
                return;
            }
            //console.log(results[0].user_id);
            resolve(results[0].user_id);
        });
    });
    return myPromise;
}

function getLoggedInUser(req){
    return axios.post("https://nmartinez-auth-service.herokuapp.com/api/user/auth/", req.body,
        {
            headers: {
            'auth-token': req.cookies['auth-token']
            }
        }).then(
            (response) => {
                console.log('logged-in');
                return response.data.user.username;
            })
        .catch((error) => {
            console.log('not logged-in');
            return null;
        }
    ); 
}

function getRating(res,mysql,context,id,complete){
    var sql = 'SELECT AVG(rating_val) AS avg_rating, GROUP_CONCAT(Ratings.user_id) AS users FROM Ratings WHERE Ratings.fancast_id = ?';
    var inserts = [id];
    mysql.pool.query(sql,inserts,function(err, results, fields){
        if(err){
            console.log(err);
            return;
        }
        context.rating = results[0].avg_rating;
        users = results[0].users;
        if (users == null){
            context.already_voted = [];
        } else {
            context.already_voted = users.split(',');
        }
        console.log(context.already_voted);
        complete();
    });
}

function getFancast(res,mysql,context,id,complete){
    var sql = 'SELECT Characters.char_id, Users.username, Fancasts.user_id, Fancasts.book_name, Characters.char_name, Characters.actor FROM Fancasts LEFT JOIN Users ON Fancasts.user_id = Users.user_id LEFT JOIN Characters ON Fancasts.fancast_id = Characters.fancast_id WHERE Fancasts.fancast_id = ?';
    var inserts = [id];
    console.log(inserts);
    mysql.pool.query(sql,inserts,function(err, results, fields){
        if(err){
            console.log(err);
            res.send(err);
            return;
        }
        context.fancast = results;
        console.log(results);
        context.creator_user_id = results[0].user_id;
        complete();
    });
}

function getFancasts(res,mysql,context,book_name,complete){
    var sql = 'SELECT Users.username, fancast_id FROM Fancasts INNER JOIN Users ON Fancasts.user_id = Users.user_id WHERE Fancasts.book_name = ?';
    var inserts = [book_name];
    mysql.pool.query(sql,inserts,function(err, results, fields){
        if(err){
            console.log(err);
            return;
        }
        context.fancasts = results;
        complete();
    });
}

function getImage(book_title){
    return axios.post('https://gehrinma-microservice.herokuapp.com/api/image', {title: book_title}).then(
        (response) => {
            return response.data;
        })
        .catch((error) => {
            console.log(error);
            return null;
        });
}

async function getCredits(movie_id){
    var creditURL = baseURL + '/movie/' + movie_id + '/credits' + apiKey + '&language=en-US';
    return axios.get(creditURL).then(
        (response) => {
            return response.data.cast;
        })
        .catch((error) => {console.log(error)});
}

async function getMovieDetails(movie_id, type){
    if (type == 'series'){
        var detailURL = baseURL + '/tv/' + movie_id + '&language=en-US' + apiKey;
    } else{
        var detailURL = baseURL + '/movie/' + movie_id + '&language=en-US' +apiKey;
    }
    return axios.get(detailURL).then(
        (response) => {
            return {
                id: response.data.id,
                title: response.data.title,
                imdb: response.data.imdb_id,
                poster: response.data.poster_path,
                rating: response.data.vote_average
            }; 
        })
        .catch((error) => {console.log(error)});
}

async function getMovieID(context){
    const promises = context.movies.map((movie) => {
        var title = movie.name;
        var year = movie.year;
        title = encodeURIComponent(title);
        var type = movie.name.slice(-7,-1);
        if (type == 'series'){
            var searchURL = searchTV + '&language=en-US&query=' + title + '&include_adult=false&year=' + year;
        } else {
            var searchURL = searchMovie + '&language=en-US&query=' + title + '&year=' + year;
        }
        return axios.get(searchURL).then(
            async (response) => {
                const movies = response.data.results;
                if (movies[0]){
                    return await getMovieDetails(movies[0].id, type);
                }
            });
    });
    return Promise.all(promises);   
}

async function bookSearch(searchStr, context){
    const result = await request.get(searchStr);
    const $ = cheerio.load(result);
    var bookInfo = context.bookInfo;
    const movies = [];
    const titles = [];
    const author = [];
    $("#block-system-main > div > div > div.view-content > table > tbody > tr").each((index, element) => {
        const adaptation = $(element).find("td");
        const book_title = $(adaptation[0]).text();
        const movie_title = $(adaptation[1]).text();
        if (book_title.includes(bookInfo)){
            var book_only_title = book_title.slice(11,-80);
            var title_author = book_only_title.split("/");
            var title_nospace = title_author[0].slice(0,-1);
            if (!titles.includes(title_nospace)){
                titles.push(title_nospace);
            }
            if (!author.includes(title_author[1])){
                author.push(title_author[1]);
            }
            var movie_name = movie_title.slice(11,-92);
            var movie_year = movie_title.slice(-90,-86);
            const movie = {name: movie_name, year: movie_year};
            movies.push(movie);
        }
    });
    context.book_title = titles;
    context.author = author;
    context.movies = movies;
    return context;
}

const checkLogin = async function (req, res, next) {
    const loggedInUser = await getLoggedInUser(req);

    // Checks if the user is logged in
    if(!loggedInUser) {
  
      // If user is not logged in
  
      // Get relative path of current url
      const url = req.originalUrl;
  
      // And redirect to login page, passing
      // the url as a query string that Angular
      // can access later
      res.redirect('/user-login?redirect='+ url);
  
    } else {
  
      // If user is logged in
      // go on and render the page
      next();
  
    }
  }

app.get('/', async function(req,res){
    var context = {};
    context.isHome = true;
    context.isCreate = false;
    context.isLogin = false;
    context.isRegister = false;
    const loggedInUser = await getLoggedInUser(req);
    if(loggedInUser != null){ 
        context.username = loggedInUser;
    }
    res.render('home', context);
});

app.get('/new-user-register',function(req,res){
    var context = {};
    context.isHome = false;
    context.isCreate = false;
    context.isLogin = false;
    context.isRegister = true;
    res.render('register', context);
});

app.post('/new-user-register',function(req,res,next){
    axios.post("https://nmartinez-auth-service.herokuapp.com/api/user/register/", req.body).then(
        (response) => {
            var sql = "INSERT INTO Users (`username`,`email`) VALUES (?,?)";
            var inserts = [req.body.username,req.body.email];
            mysql.pool.query(sql, inserts, function(err, results){
                if(err){
                    next(err);
                    return;
                }
                res.redirect('/user-login');
            });
        })
        .catch((error) => {
            var context = {};
            console.log(error);
            context.error = error;
            res.render('register-error', context); 
        });
});


app.get('/user-login', function(req,res){
    var context = {};
    context.isHome = false;
    context.isCreate = false;
    context.isLogin = true;
    context.isRegister = false;
    res.render('login', context);
});

app.post('/user-login',function(req,res,next){
    axios.post("https://nmartinez-auth-service.herokuapp.com/api/user/login/", {username: req.body.username, password: req.body.password}).then(
        (response) => {
            res.cookie(`auth-token`, response.headers['auth-token'], {
                maxAge: oneDay,
                secure: true,
                httpOnly: true,
                sameSite: 'lax'
            });
            console.log(res.cookie);
            if (req.body.redirect){
                res.redirect(req.body.redirect);
            } else{
                console.log('no query');
                res.redirect('/');
            }
        })
        .catch((error) => {
            var context = {};
            console.log(error.response.data);
            context.error = error.response.data;
            res.render('register-error', context); 
        });
});

app.get('/logout',(req,res) => {
    // clear the cookie
    res.clearCookie("auth-token");
    // redirect to home
    res.redirect('/');
});

app.get('/adaptations', async function(req,res){
    var context = {};
    const loggedInUser = await getLoggedInUser(req);
    if(loggedInUser){ 
        context.username = loggedInUser;
    }
    var bookInfo = req.query.book_search;
    bookInfo.toLowerCase;
    bookInfo[0].toUpperCase;
    context.bookInfo = bookInfo;
    if (bookInfo.substring(0,1) == "A "){
        var firstChar = bookInfo.charAt(2);
    } else if (bookInfo.substring(0,3) == "The "){
        var firstChar = bookInfo.charAt(4);
    } else {
        var firstChar = bookInfo.charAt(0);
    }
    var searchStr = bookURL + firstChar;
    bookSearch(searchStr,context).then(function (context){
        getMovieID(context).then(async (movies) => {
            context.movies = movies;
            console.log(context.movies);
            context.book_cover = await getImage(context.book_title[0]);
            //context.log(context.book_cover);
            getFancasts(res,mysql,context,context.book_title[0], complete);
            function complete(){
                res.render('adaptations', context);
            }
        });
    })
});

app.get('/adaptation-info/:id', async function(req,res){
    var context = {};
    const loggedInUser = await getLoggedInUser(req);
    if(loggedInUser){ 
        context.username = loggedInUser;
    }
    const id = req.params.id;
    context.adaptation = await getMovieDetails(id);
    context.adaptation.cast = await getCredits(id);
    res.render('adaptation-info', context);
});

app.get('/fancast-info/:id', async function(req,res){
    var context = {};
    context.fancast_id = req.params.id;
    console.log(context.fancast_id);
    const loggedInUser = await getLoggedInUser(req);
    if(loggedInUser){ 
        context.username = loggedInUser;
        context.user_id = await getUserID(res,mysql,loggedInUser);
        console.log(context.user_id);
    }
    getRating(res, mysql, context, req.params.id, resultRating);
    async function resultRating(){
        if(loggedInUser){
            if (context.already_voted != null && context.already_voted.includes(String(context.user_id))){
                context.voted = true;
            }
        }
        getFancast(res, mysql, context, req.params.id, resultFancast);
    }
    async function resultFancast(){
        context.book_cover = await getImage(context.fancast[0].book_name);
        if (context.creator_user_id === context.user_id){
            context.voted = true;
            context.modify_fancast = true;
        }
        for (let i = 0; i < context.fancast.length; i++) {
            context.fancast[i].actor_img = await getImage(context.fancast[i].actor);
        }
        res.render('fancast-info', context);
    }    
});

app.post('/rate-fancast/:user_id/:fancast_id', checkLogin, async function(req,res,next){
    const loggedInUser = await getLoggedInUser(req);
    const user_id = await getUserID(res,mysql,loggedInUser);
    if (user_id === req.params.user_id){
       res.redirect('/access-denied');
    } else if (req.params.user_id === "undefined"){
        res.redirect('/user-login');
    } else {
        var sql = "INSERT INTO Ratings (`fancast_id`,`user_id`,`rating_val`) VALUES (?,?,?)";
        var inserts = [req.params.fancast_id,user_id,req.body.rating];
        mysql.pool.query(sql, inserts, function(err, results){
            if(err){
                console.log(err);
                return;
            }
            res.redirect('/fancast-info/' + req.params.fancast_id);
        });
    }
});

app.get('/create-fancast', checkLogin, async function(req,res){
    var context = {};
    context.isHome = false;
    context.isCreate = true;
    context.isLogin = false;
    context.isRegister = false;
    const loggedInUser = await getLoggedInUser(req);
    if(loggedInUser != null){ 
        context.username = loggedInUser;
    }
    res.render('fancasting', context);
});

app.post('/create-fancast', async function(req,res,next){
    const loggedInUser = await getLoggedInUser(req);
    if(loggedInUser){
        const user_id = await getUserID(res,mysql,loggedInUser); 
        fancast_book = req.body.fancast_book;
        console.log(fancast_book);
        book_cover = await getImage(fancast_book);
        if (book_cover == null){
            res.redirect('/book-does-not-exist');
        } else{
            var sql = "INSERT INTO Fancasts (`user_id`,`book_name`) VALUES (?,?)";
            var inserts = [user_id, req.body.fancast_book];
            mysql.pool.query(sql, inserts, async function(err, results){
                if(err){
                    next(err);
                    return;
                }
                console.log(results.insertId);
                const fancast_id = results.insertId;
                var book_title = encodeURIComponent(fancast_book);
                const redirectLink = '/new-fancast/' + user_id + '/' + fancast_id + '/' + book_title;
                res.redirect(redirectLink);
            });
        }
    } else{
        res.redirect('/user-login');
    }
});

app.get('/new-fancast/:user_id/:fancast_id/:book_title', checkLogin, async function(req,res){
    var context = {};
    const loggedInUser = await getLoggedInUser(req);
    if(loggedInUser){ 
        context.username = loggedInUser;
    }
    const user_id = await getUserID(res,mysql,loggedInUser);
    if (user_id != req.params.user_id){
        res.redirect('/access-denied');
    } else {
        context.user = loggedInUser;
        context.user_id = req.params.user_id;
        context.book_title = req.params.book_title;
        context.book_cover = await getImage(context.book_title);
        context.fancast_id = req.params.fancast_id;
        getFancast(res, mysql, context, req.params.fancast_id, complete);
        async function complete(){
            console.log(context.fancast);
            if (context.fancast[0].char_id != null){
                for (let i = 0; i < context.fancast.length; i++) {
                    context.fancast[i].actor_img = await getImage(context.fancast[i].actor);
                }
            }
            res.render('new-fancast', context);
        }
    }
});

app.post('/new-fancast', checkLogin, async function(req,res,next){
    const loggedInUser = await getLoggedInUser(req);
    const user_id = await getUserID(res,mysql,loggedInUser);
    if (user_id != req.body.user_id){
       res.redirect('/access-denied');
    } else {
        var sql = "INSERT INTO Characters (`actor`,`char_name`,`fancast_id`) VALUES (?,?,?)";
        var inserts = [req.body.actor,req.body.char_name,req.body.fancast_id];
        mysql.pool.query(sql, inserts, function(err, results){
            if(err){
                console.log(err);
                return;
            }
            const redirectLink = '/new-fancast/' + req.body.user_id + '/' + req.body.fancast_id + '/' +  req.body.book_name;
            res.redirect(redirectLink);
        });
    }
});

app.post('/delete-char/:user_id/:fancast_id/:book_title/:char_id', checkLogin, async function(req,res,next){
    const loggedInUser = await getLoggedInUser(req);
    const user_id = await getUserID(res,mysql,loggedInUser);
    if (user_id != req.params.user_id){
       res.redirect('/access-denied');
    } else {
        var sql = "DELETE FROM Characters WHERE char_id = ?";
        var inserts = [req.params.char_id];
        mysql.pool.query(sql, inserts, function(err, results){
            if(err){
                console.log(err);
                return;
            }
            const redirectLink = '/new-fancast/' + req.params.user_id + '/' + req.params.fancast_id + '/' +  req.params.book_title;
            res.redirect(redirectLink);
        });
    }
});

app.post('/delete-fancast/:user_id/:fancast_id', checkLogin, async function(req,res,next){
    const loggedInUser = await getLoggedInUser(req);
    const user_id = await getUserID(res,mysql,loggedInUser);
    if (user_id != req.params.user_id){
       res.redirect('/access-denied');
    } else {
        var sql = "DELETE FROM Fancasts WHERE fancast_id = ?";
        var inserts = [req.params.char_id];
        mysql.pool.query(sql, inserts, function(err, results){
            if(err){
                console.log(err);
                return;
            }
            res.redirect('/');
        });
    }
});

app.get('/book-does-not-exist',async function(req,res){
    var context = {};
    const loggedInUser = await getLoggedInUser(req);
    if(loggedInUser != null){ 
        context.username = loggedInUser;
    }
    res.render('book-does-not-exist', context);
});

app.get('/access-denied', async function(req,res){
    var context = {};
    const loggedInUser = await getLoggedInUser(req);
    if(loggedInUser != null){ 
        context.username = loggedInUser;
    }
    res.render('access-denied', context);
});

app.use(function(req,res){
    res.status(404);
    res.render('404');
});

app.use(function(err, req, res, next){
    console.error(err.stack);
    res.type('plain/text');
    res.status(500);
    res.render('500');
});

app.listen(app.get('port'), function(){
    console.log('App listening to port ' + app.get('port'));
});