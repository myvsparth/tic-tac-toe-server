const server = require('http').createServer(); // STEP 1 ::=> HTTP Server object
const io = require('socket.io')(server); // STEP 2 ::=> Bind socket.io to http server so after http connection the bidirectional communication keep up using web sockets.
const PORT = 4444; // PORT of server
const HOST = "127.0.0.1"; // Hosting Server change when you make it live on server according to your hosting server
var players = {}; // It will keep all the players data who have register using mobile number. you can use actual persistence database I have used this for temporery basis
var sockets = {}; // stores all the connected clients
var games = {}; // stores the ongoing game
var winCombinations = [
    [[0, 0], [0, 1], [0, 2]],
    [[1, 0], [1, 1], [1, 2]],
    [[2, 0], [2, 1], [2, 2]],
    [[0, 0], [1, 0], [2, 0]],
    [[0, 1], [1, 1], [2, 1]],
    [[0, 2], [1, 2], [2, 2]],
    [[0, 0], [1, 1], [2, 2]],
    [[0, 2], [1, 1], [2, 0]]
]; // game winning combination index 

// STEP 4 ::=> When any request comes it will trigger and bind all the susequence events that will triggered as per app logic
io.on('connection', client => {
    console.log("connected : " + client.id);
    client.emit('connected', { "id": client.id }); // STEP 5 ::=> Notify request cllient that it is not connected with server
    
    // STEP 6 ::=> It is a event which will handle user registration process
    client.on('checkUserDetail', data => {
        var flag = false;
        for (var id in sockets) {
            if (sockets[id].mobile_number === data.mobileNumber) {
                flag = true;
                break;
            }
        }
        if (!flag) {
            sockets[client.id] = {
                mobile_number: data.mobileNumber,
                is_playing: false,
                game_id: null
            };

            var flag1 = false;
            for (var id in players) {
                if (id === data.mobileNumber) {
                    flag1 = true;
                    break;
                }
            }
            if (!flag1) {
                players[data.mobileNumber] = {
                    played: 0,
                    won: 0,
                    draw: 0
                };
            }

        }
        client.emit('checkUserDetailResponse', !flag);
    });

    // STEP 7 ::=> It will send all the players who are online and avalable to play the game
    client.on('getOpponents', data => {
        var response = [];
        for (var id in sockets) {
            if (id !== client.id && !sockets[id].is_playing) {
                response.push({
                    id: id,
                    mobile_number: sockets[id].mobile_number,
                    played: players[sockets[id].mobile_number].played,
                    won: players[sockets[id].mobile_number].won,
                    draw: players[sockets[id].mobile_number].draw
                });
            }
        }
        client.emit('getOpponentsResponse', response);
        client.broadcast.emit('newOpponentAdded', {
            id: client.id,
            mobile_number: sockets[client.id].mobile_number,
            played: players[sockets[client.id].mobile_number].played,
            won: players[sockets[client.id].mobile_number].won,
            draw: players[sockets[client.id].mobile_number].draw
        });
    });

    // STEP 8 ::=> When Client select any opponent to play game then it will generate new game and return playboard to play the game. New game starts here
    client.on('selectOpponent', data => {
        var response = { status: false, message: "Opponent is playing with someone else." };
        if (!sockets[data.id].is_playing) {
            var gameId = uuidv4();
            sockets[data.id].is_playing = true;
            sockets[client.id].is_playing = true;
            sockets[data.id].game_id = gameId;
            sockets[client.id].game_id = gameId;
            players[sockets[data.id].mobile_number].played = players[sockets[data.id].mobile_number].played + 1;
            players[sockets[client.id].mobile_number].played = players[sockets[client.id].mobile_number].played + 1;

            games[gameId] = {
                player1: client.id,
                player2: data.id,
                whose_turn: client.id,
                playboard: [["", "", ""], ["", "", ""], ["", "", ""]],
                game_status: "ongoing", // "ongoing","won","draw"
                game_winner: null, // winner_id if status won
                winning_combination: []
            };
            games[gameId][client.id] = {
                mobile_number: sockets[client.id].mobile_number,
                sign: "x",
                played: players[sockets[client.id].mobile_number].played,
                won: players[sockets[client.id].mobile_number].won,
                draw: players[sockets[client.id].mobile_number].draw
            };
            games[gameId][data.id] = {
                mobile_number: sockets[data.id].mobile_number,
                sign: "o",
                played: players[sockets[data.id].mobile_number].played,
                won: players[sockets[data.id].mobile_number].won,
                draw: players[sockets[data.id].mobile_number].draw
            };
            io.sockets.connected[client.id].join(gameId);
            io.sockets.connected[data.id].join(gameId);
            io.emit('excludePlayers', [client.id, data.id]);
            io.to(gameId).emit('gameStarted', { status: true, game_id: gameId, game_data: games[gameId] });

        }
    });

    var gameBetweenSeconds = 10; // Time between next game
    var gameBetweenInterval = null;

    // STEP 9 ::=> When Player select any cell then it will check all the necessory logic of Tic Tac Toe Game
    client.on('selectCell', data => {
        games[data.gameId].playboard[data.i][data.j] = games[data.gameId][games[data.gameId].whose_turn].sign;

        var isDraw = true;
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                if (games[data.gameId].playboard[i][j] == "") {
                    isDraw = false;
                    break;
                }
            }
        }
        if (isDraw)
            games[data.gameId].game_status = "draw";


        for (let i = 0; i < winCombinations.length; i++) {
            var tempComb = games[data.gameId].playboard[winCombinations[i][0][0]][winCombinations[i][0][1]] + games[data.gameId].playboard[winCombinations[i][1][0]][winCombinations[i][1][1]] + games[data.gameId].playboard[winCombinations[i][2][0]][winCombinations[i][2][1]];
            if (tempComb === "xxx" || tempComb === "ooo") {
                games[data.gameId].game_winner = games[data.gameId].whose_turn;
                games[data.gameId].game_status = "won";
                games[data.gameId].winning_combination = [[winCombinations[i][0][0], winCombinations[i][0][1]], [winCombinations[i][1][0], winCombinations[i][1][1]], [winCombinations[i][2][0], winCombinations[i][2][1]]];
                players[games[data.gameId][games[data.gameId].game_winner].mobile_number].won++;
            }
        }
        if (games[data.gameId].game_status == "draw") {
            players[games[data.gameId][games[data.gameId].player1].mobile_number].draw++;
            players[games[data.gameId][games[data.gameId].player2].mobile_number].draw++;
        }
        games[data.gameId].whose_turn = games[data.gameId].whose_turn == games[data.gameId].player1 ? games[data.gameId].player2 : games[data.gameId].player1;
        io.to(data.gameId).emit('selectCellResponse', games[data.gameId]);

        if (games[data.gameId].game_status == "draw" || games[data.gameId].game_status == "won") {
            gameBetweenSeconds = 10;
            gameBetweenInterval = setInterval(() => {
                gameBetweenSeconds--;
                io.to(data.gameId).emit('gameInterval', gameBetweenSeconds);
                if (gameBetweenSeconds == 0) {
                    clearInterval(gameBetweenInterval);

                    var gameId = uuidv4();
                    sockets[games[data.gameId].player1].game_id = gameId;
                    sockets[games[data.gameId].player2].game_id = gameId;
                    players[sockets[games[data.gameId].player1].mobile_number].played = players[sockets[games[data.gameId].player1].mobile_number].played + 1;
                    players[sockets[games[data.gameId].player2].mobile_number].played = players[sockets[games[data.gameId].player2].mobile_number].played + 1;

                    games[gameId] = {
                        player1: games[data.gameId].player1,
                        player2: games[data.gameId].player2,
                        whose_turn: games[data.gameId].game_status == "won" ? games[data.gameId].game_winner : games[data.gameId].whose_turn,
                        playboard: [["", "", ""], ["", "", ""], ["", "", ""]],
                        game_status: "ongoing", // "ongoing","won","draw"
                        game_winner: null, // winner_id if status won
                        winning_combination: []
                    };
                    games[gameId][games[data.gameId].player1] = {
                        mobile_number: sockets[games[data.gameId].player1].mobile_number,
                        sign: "x",
                        played: players[sockets[games[data.gameId].player1].mobile_number].played,
                        won: players[sockets[games[data.gameId].player1].mobile_number].won,
                        draw: players[sockets[games[data.gameId].player1].mobile_number].draw
                    };
                    games[gameId][games[data.gameId].player2] = {
                        mobile_number: sockets[games[data.gameId].player2].mobile_number,
                        sign: "o",
                        played: players[sockets[games[data.gameId].player2].mobile_number].played,
                        won: players[sockets[games[data.gameId].player2].mobile_number].won,
                        draw: players[sockets[games[data.gameId].player2].mobile_number].draw
                    };
                    io.sockets.connected[games[data.gameId].player1].join(gameId);
                    io.sockets.connected[games[data.gameId].player2].join(gameId);
            
                    io.to(gameId).emit('nextGameData', { status: true, game_id: gameId, game_data: games[gameId] });

                    io.sockets.connected[games[data.gameId].player1].leave(data.gameId);
                    io.sockets.connected[games[data.gameId].player2].leave(data.gameId);
                    delete games[data.gameId];
                }
            }, 1000);
        }

    });

    // STEP 10 ::=> When any player disconnect then it will handle the disconnect process
    client.on('disconnect', () => {
        console.log("disconnect : " + client.id);
        if (typeof sockets[client.id] != "undefined") {
            if (sockets[client.id].is_playing) {
            
                io.to(sockets[client.id].game_id).emit('opponentLeft', {});
                players[sockets[games[sockets[client.id].game_id].player1].mobile_number].played--;
                players[sockets[games[sockets[client.id].game_id].player2].mobile_number].played--;
                io.sockets.connected[client.id == games[sockets[client.id].game_id].player1 ? games[sockets[client.id].game_id].player2 : games[sockets[client.id].game_id].player1].leave(sockets[client.id].game_id);
                delete games[sockets[client.id].game_id];
            }
        }
        delete sockets[client.id];
        client.broadcast.emit('opponentDisconnected', {
            id: client.id
        });
    });
});


server.listen(PORT, HOST); // 3 ::=> Staring HTTP server which will be consumed by clients
console.log("listening to : " + HOST + ":" + PORT);


// Generate Game ID
function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}