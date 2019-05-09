var express = require('express');
var app     = express();
var path    = require("path");
var server  = require('http').Server(app);
var io      = require('socket.io')(server);
var flash   = require("connect-flash");
var morgan  = require("morgan");
var session = require("express-session");
var mongoose     = require("mongoose");
var passport     = require("passport");
var cookieParser = require("cookie-parser");
var bodyParser   = require("body-parser");


mongoose.connect("mongodb+srv://admin_1:password_1@cluster0-kzopf.mongodb.net/test?retryWrites=true", {useNewUrlParser: true});
mongoose.set('useCreateIndex', true);

app.set("view engine", "ejs");
app.use(express.static('templates'));
app.use(express.static('static'));
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());
app.use(cookieParser("secretkey"));
app.use(morgan("dev"));

var sessionStore = new session.MemoryStore();
var sessionSetup = session({
    secret: "simplesecretkey",
    resave: true,
    saveUninitialized: true,
    store: sessionStore
});


app.use(sessionSetup);

app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

require("./config/passport-config");

var authRouter = require("./router/authentication-router");
app.use("/a", authRouter);

app.get('/', (req, res) => {
    if(!req.isAuthenticated()){
        return res.redirect("/a/login");
    }

    return res.sendFile(path.resolve(__dirname, "./templates/chatpage.html"));
});

app.get("/chat", (req, res)=>{
    if(!req.isAuthenticated()){
        return res.redirect("/a/login");
    }

    return res.sendFile(path.resolve(__dirname, "./templates/chatpage.html"));
});

/*app.get(/^\/login$|^\/register$/, (req, res)=>{
    var registerMessage = req.flash("registerMessage");
    var loginMessage    = req.flash("loginMessage");

    console.log("registerMessage", registerMessage);
    console.log("loginMessage", loginMessage);
    res.sendFile(path.resolve(__dirname, "./templates/authentication.html"));
});*/


// return true if username not taken
app.get('/isUserValid', (req, res) => {
    var username = req.query.username;
    res.send(!connectedUsers.has(username));
});

app.get('/getOnlineUsers', (req, res) => {
    res.send(Array.from(connectedUsers));
});

app.get('/previousMessages', (req, res) => {
    res.send(allMessages);
});

// list of all messages
// a message contains a user and the text
var allMessages = [];
var connectedUsers = new Set();
var connectedSockets = [];

// when a user connects,
// give them all the previous messages
io.on('connection', (socket) => {
    // when a new chat message is received
    // store it and emit it to all users
    socket.on('chat-msg', (payload) => {
        allMessages.push(payload);
        // console.log(payload.message);
        // console.log(payload.message.match(/\/w/));
        // console.log(payload.message.match(/\/w (\w+) \w+/));

        if(payload.message.match(/\/w/)){
            var targetUser = payload.message.match(/\/w +(\w+)/)[1];
            var message    = payload.message.match(/\/w +\w+ (.*)/)[1];
            // console.log("target is: " + connectedUsers.get(targetUser));

            for(const userSocket of connectedSockets){
                if(userSocket.username == targetUser){
                    // A new payload is created to avoid mutation.
                    var newPayload = {
                        username : payload.username,
                        message  : "** " + message + " **",
                        type     : "message"
                    };

                    socket.emit("chat-msg", newPayload);
                    userSocket.socket.emit("chat-msg", newPayload);
                }
            }
            return;
        }

        io.emit('chat-msg', payload);
    })

    // when a user is typing
    // emit it to all users except current user
    socket.on('is-typing', (user) => {
        socket.broadcast.emit('is-typing', user);
    })

    // when user stops typing
    // emit it to all users except current user
    socket.on('stopped-typing', (user) => {
        socket.broadcast.emit('stopped-typing', user);
    })

    // when current user enters their username
    socket.on('user-connect', (user) => {
        connectedUsers.add(user); // add user to connected users set

        // The socket object is used to receive the target message.
        // The username is used to identify the user.
        var userSocket = {
            username: user,
            socket  : socket
        };
        connectedSockets.push(userSocket);

        socket._username = user;  // store the username to access on disconnect

        var msg = {
            'message': `${user} has connected`,
            'type': 'info'
        }
        io.emit('chat-msg', msg);   // emit user join msg
        io.emit('user-online', user); // say that this user is now online

        allMessages.push(msg); // store the user join msg
    })

    // when someone logs off
    socket.on('disconnect', () => {
        var user = socket._username;
        connectedUsers.delete(user); // delete this user from set

        // Remove the connectedSocket object.
        for(var i= 0; i < connectedSockets.length; i++ ){
            if(connectedSockets[i] != null 
                && connectedSockets[i].username == user)
            {
                delete connectedSockets[i];
            }
        }

        socket.broadcast.emit('user-offline', user); // broadcast that the user left

        var msg = {
            'message': `${user} has disconnected`,
            'type': 'info'
        };

        allMessages.push(msg); // store this message
        io.emit('chat-msg', msg); // emit disconnection message
    })
});

// listen on port 8000
server.listen(80, () => {
    console.log('server listening');
});