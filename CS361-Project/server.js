const express = require('express');
const mysql = require('./db-connector')

const cheerio = require('cheerio');
const request = require('request-promise');
const axios = require('axios').default;

const app = express();
const handlebars = require('express-handlebars').create({defaultLayout:'main'});

const bookURL = 'https://apps.mymcpl.org/botb/book/browse/';

app.engine('handlebars', handlebars.engine);
app.set('view engine', 'handlebars');

app.set('port', 1470);

const bodyParser = require('body-parser');

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use('/static', express.static('public'))

const apiKey = '?api_key=73c59520f5516b6c7fdc81e0971e6e24';
const baseURL = 'https://api.themoviedb.org/3';
const searchMovie = baseURL + '/search/movie' + apiKey;
const searchTV = baseURL + '/search/tv' + apiKey;


function getBookCover(book_title){
    return axios.post('https://gehrinma-microservice.herokuapp.com/api/image', {title: book_title}).then(
        (response) => {
            console.log(response.data);
            return response.data;
        })
        .catch((error) => {console.log(error)});
}

function getCredits(movie_id){
    var creditURL = baseURL + '/movie/' + movie_id + '/credits' + apiKey + '&language=en-US';
    return axios.get(creditURL).then(
        (response) => {
            return response.data.cast;
        })
        .catch((error) => {console.log(error)});
}

function getMovieDetails(movie_id, type){
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

app.get('/',function(req,res){
    var context = {};
    res.render('home', context);
});

app.get('/log-in',function(req,res){
    var context = {};
    res.render('login', context);
});

app.get('/new-user-register',function(req,res){
    var context = {};
    res.render('register', context);
});

app.get('/user-login',function(req,res){
    var context = {};
    res.render('login', context);
});

app.get('/adaptations',function(req,res){
    var context = {};
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
    bookSearch(searchStr,context).then(function complete(context){
        getMovieID(context).then(async (movies) => {
            context.movies = movies;
            console.log(context.movies);
            context.book_cover = await getBookCover(context.book_title[0]);
            //context.log(context.book_cover);
            res.render('adaptations', context);
        });
    })
});

app.get('/adaptation-info/:id', async function(req,res){
    var context = {};
    const id = req.params.id;
    context.adaptation = await getMovieDetails(id);
    context.adaptation.cast = await getCredits(id);
    console.log(context.adaptation);
    res.render('adaptation-info', context);
});

app.get('/create-fancast',function(req,res){
    var context = {};
    res.render('fancasting', context);
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