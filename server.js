var express = require('express');
var mysql = require('./db-connector')

const cheerio = require('cheerio');
const request = require('request-promise');

var app = express();
var handlebars = require('express-handlebars').create({defaultLayout:'main'});

const bookURL = 'https://apps.mymcpl.org/botb/book/browse/';

app.engine('handlebars', handlebars.engine);
app.set('view engine', 'handlebars');

app.set('port', 1470);

var bodyParser = require('body-parser');

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use('/static', express.static('public'))

var apiKey = '5d8e4af3';

function omdbRequest(movies){
    var req = new XMLHttpRequest();
    for (let i = 0; i < 10; i++){
        req.open('GET', 'http://www.omdbapi.com/?apikey=' + apiKey + '&t=' + movies[i]);
    }
}

async function bookSearch(searchStr, context){
    const result = await request.get(searchStr);
    const $ = cheerio.load(result);
    var bookInfo = context.bookInfo;
    const movies = [];
    const titles = [];
    $("#block-system-main > div > div > div.view-content > table > tbody > tr").each((index, element) => {
        const adaptation = $(element).find("td");
        const book_title = $(adaptation[0]).text();
        const movie_title = $(adaptation[1]).text();
        if (book_title.includes(bookInfo)){
            var book_only_title = book_title.slice(11,-80);
            if (!titles.includes(book_only_title)){
                titles.push(book_only_title);
            }
            var only_title = movie_title.slice(11,-85);
            movies.push(only_title);
        }
    });
    context.book_title = titles;
    console.log(context.book_title); 
    context.movies = movies;
    console.log(movies); 
}

app.get('/',function(req,res){
    var context = {};
    res.render('home', context);
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
    bookSearch(searchStr,context);
    res.render('adaptations', context);
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