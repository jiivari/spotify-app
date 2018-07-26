var express = require('express'); // Express web server framework
var request = require('request'); // "Request" library
var querystring = require('querystring');
var cookieParser = require('cookie-parser');
var app = express();
var port = process.env.PORT || process.env.OPENSHIFT_NODEJS_PORT || 8080,
    ip   = process.env.IP   || process.env.OPENSHIFT_NODEJS_IP || '0.0.0.0'
var uuid = require('uuid');
var bodyParser = require('body-parser')
require('dotenv').config();

var client_id = process.env.client_id; // Your client id
var client_secret = process.env.client_secret; // Your secret
var redirect_uri = process.env.redirect_uri; // Your redirect uri

var generateRandomString = function(length) {
  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

var stateKey = 'spotify_auth_state';

app.use(express.static(__dirname + '/authorization_code/public'))
   .use(cookieParser())
  //  .use(bodyParser.json())
   .use(bodyParser.urlencoded({ extended: true }));

app.get('/login', function(req,res) {

    var state = generateRandomString(16);
    res.cookie(stateKey, state);

    // your application requests authorization
    var scope = 'user-read-private user-read-email';
    res.redirect('https://accounts.spotify.com/authorize?' +
      querystring.stringify({
        response_type: 'code',
        client_id: client_id,
        scope: scope,
        redirect_uri: redirect_uri,
        state: state
      }));

});

app.get('/getgenres', function(req, res) {

  var accesstoken = req.query.access_token;
  var uri = 'https://api.spotify.com/v1/recommendations/available-genre-seeds?access_token=' + accesstoken;

  var options = {
    'method': 'GET',
    'uri': uri
  };

  request(options,function(error, response, body) {
    if (error) {
      console.log(error.message);
    }
    jsonContent = JSON.parse(body);
    var htmlmessage = '';
    var paging = 1;
    for (var index in jsonContent.genres){
      htmlmessage = htmlmessage + '<input type="checkbox" name="' + 'seed_genres' +
       '" value="' + jsonContent.genres[index] + '">' + jsonContent.genres[index] + '         ';
      paging = paging + 1;
      if (paging > 8) {
        htmlmessage = htmlmessage + '<br>';
        paging = 1
      }
    }
    htmlmessage = htmlmessage + '';
    res.send(htmlmessage);

  });

});

app.post('/getsong', function(req, res) {

  var isArray = require('isarray');

  var seed_genres = '';

  if (isArray(req.body.seed_genres)) {
    for (var index in req.body.seed_genres) {
        seed_genres = seed_genres + req.body.seed_genres[index] + ',';
    }
    seed_genres = seed_genres.slice(0, -1);
  } else {
    seed_genres = req.body.seed_genres
  }

  var accesstoken = req.body.access_token;

  var querystring = seed_genres == undefined
      ? '&seed_tracks=' + req.body.track
      : '&seed_genres=' + seed_genres;

  var uri = 'https://api.spotify.com/v1/recommendations?' + querystring + '&min_popularity='+ req.body.popularity +'&market='+ req.body.market +'&access_token=' + accesstoken;

  var options = {
    'method': 'GET',
    'uri': uri
  };


  request(options,function(error, response, body) {
    if (error) {
      console.log(error.message);
    }
    jsonContent = JSON.parse(body);
    var htmlmessage = '';
    for (var index in jsonContent.tracks){
      if (jsonContent.tracks[index].name == null) {
        data = {};
      } else {
        htmlmessage = htmlmessage + '<a href="' + jsonContent.tracks[index].external_urls.spotify + '"><img src="' + jsonContent.tracks[index].album.images[1].url + '" style="width:220px;height:220px;"></a>';
      }
    }
    htmlmessage = htmlmessage + '';

    if (htmlmessage == '') {
      res.send('<h1>nothing found</h1>');
    } else {
      res.send(htmlmessage);
    }

  });

});

app.get('/callback', function(req, res) {

  // your application requests refresh and access tokens
  // after checking the state parameter

  var code = req.query.code || null;
  var state = req.query.state || null;
  var storedState = req.cookies ? req.cookies[stateKey] : null;

  if (state === null || state !== storedState) {
    res.redirect('/#' +
      querystring.stringify({
        error: 'state_mismatch'
      }));
  } else {
    res.clearCookie(stateKey);
    var authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      form: {
        code: code,
        redirect_uri: redirect_uri,
        grant_type: 'authorization_code'
      },
      headers: {
        'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
      },
      json: true
    };

    request.post(authOptions, function(error, response, body) {
      if (!error && response.statusCode === 200) {

        var access_token = body.access_token,
            refresh_token = body.refresh_token;

        var options = {
          url: 'https://api.spotify.com/v1/me',
          headers: { 'Authorization': 'Bearer ' + access_token },
          json: true
        };

        // use the access token to access the Spotify Web API
        request.get(options, function(error, response, body) {});

        // we can also pass the token to the browser to make requests from there
        res.redirect('/#' +
          querystring.stringify({
            access_token: access_token,
            refresh_token: refresh_token
          }));
      } else {
        res.redirect('/#' +
          querystring.stringify({
            error: 'invalid_token'
          }));
      }
    });
  }
});

app.get('/refresh_token', function(req, res) {

  // requesting access token from refresh token
  var refresh_token = req.query.refresh_token;
  var authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    headers: { 'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64')) },
    form: {
      grant_type: 'refresh_token',
      refresh_token: refresh_token
    },
    json: true
  };

  request.post(authOptions, function(error, response, body) {
    if (!error && response.statusCode === 200) {
      var access_token = body.access_token;
      res.send({
        'access_token': access_token
      });
    }
  });
});


app.listen(port, ip);
console.log('Server running on http://%s:%s', ip, port);
