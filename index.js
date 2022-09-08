const express = require('express');
const socketio = require('socket.io');
const http = require('http');
const path = require('path');
const cors = require('cors');

const Server = socketio.Server;
const app = express();
const httpServer = http.createServer(app);
const PORT = process.env.PORT || 80;

const corsOptions = {
    origin: ["*", "http://localhost:3000", "https://admin.socket.io", "https://joshiiwoshi-tic-tac-toe.herokuapp.com"],
    methods: ["GET", "POST"]
}

const io = new Server(httpServer, {
    cors: corsOptions
});

//Express
app.use(express.static(path.join(__dirname, "client", "build")));
app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({extended: false}));


app.get('/invite/:id', function (req, res) {
    res.redirect(`/?id=${req.params.id}`)
})

io.on('connection', function(socket) {
    console.log(`Client: ${socket.id} connected to the server`);
    socket.playerData = {};
    socket.roomData = {};

    async function getClients(roomId) {
        const clients = await io.in(roomId).fetchSockets();
        const clientData = [];
        for(let client in clients)
        {
            clientData.push(clients[client].playerData);
        }
        return [clients, clientData];
    }

    socket.on('disconnect', async () => {
        console.log(`Client: ${socket.id} disconnected from the server`);
        const [clients, clientData] = await getClients(socket.roomData.roomId);
        io.in(socket.roomData.roomId).emit("receive-players-data", clientData);
    });

    socket.on('leave-room', (roomId, name) => {
        console.log(`${name} has left the ${roomId} room.`);
        socket.leave(roomId);
    });

    socket.on('join-room', async (roomId, playerId, name, avatar) => {
        const [clients, clientData] = await getClients(roomId);
        if(clients.length == 2)
        {
            io.in(socket.id).emit("lobby-full");
            return;
        }
        socket.roomData.roomId = roomId;
        socket.playerData.playerId = playerId;
        socket.playerData.playerName = name;
        socket.playerData.playerAvatar = avatar;
        socket.playerData.team = "X";
        socket.playerData.ready = false;
        console.log(`${name} has joined the ${roomId} room.`);
        socket.join(roomId);
        console.log(`Clients: ${io.sockets.adapter.rooms.get(roomId).size}`);
    });

    socket.on('get-players-data', async (roomId) => {
        const [clients, clientData] = await getClients(roomId);
        io.in(roomId).emit("receive-players-data", clientData);
    });

    socket.on('get-game-data', async (roomId) => {
        const [clients, clientData] = await getClients(roomId);
        if(clients[0] != undefined)
        {
            io.in(roomId).emit("receive-game-data", clients[0].roomData);
        }
    });

    socket.on('player-ready', async (roomId, playerId) => {
        const [clients, clientData] = await getClients(roomId);
        for(let client in clients)
        {
            //Loop through all clients and find the same player id
            //Set the player as ready
            if(clients[client].playerData.playerId == playerId)
            {
                clients[client].playerData.ready = !clients[client].playerData.ready
            }
        }

        io.in(roomId).emit("receive-players-data", clientData);

        //Check if there are two players
        if(clients.length == 2)
        {
            const teams = [];
            for(let client in clients)
            {
                //Check if all players are ready
                if(!clients[client].playerData.ready)
                {
                    break;
                }
                
                teams.push(clients[client].playerData.team)

                if(!teams.every(elem => elem === teams[0]))
                {
                    //Start the game

                    //Set X as first player
                    clients.map(player => {
                        if(player.playerData.team == "X")
                        {
                            clients[0].roomData.currentTurn = player.playerData.team;
                        }
                    });

                    //Set raedy to false for future rematch
                    clients.map(player => {
                        player.playerData.ready = false;
                    });
                    
                    //Set roomData
                    clients[0].roomData.matchDone = false;
                    clients[0].roomData.winner = "";
                    clients[0].roomData.table = [
                        ["fa-solid fa-bars cell", "fa-solid fa-bars cell", "fa-solid fa-bars cell"],
                        ["fa-solid fa-bars cell", "fa-solid fa-bars cell", "fa-solid fa-bars cell"],
                        ["fa-solid fa-bars cell", "fa-solid fa-bars cell", "fa-solid fa-bars cell"]];

                    //Send signal to start
                    io.in(roomId).emit("game-start");
                }
            }
        }
    });

    socket.on('change-team', async (roomId, playerId) => {
        const [clients, clientData] = await getClients(roomId);
        for(let client in clients)
        {
            //Loop through all clients and find same player id
            //Set their team 
            if(clients[client].playerData.playerId == playerId)
            {
                if(clients[client].playerData.team == "X")
                {
                    clients[client].playerData.team = "O";
                }
                else
                {
                    clients[client].playerData.team = "X";
                }
                clients[client].playerData.ready = false;
            }
        }

        io.in(roomId).emit("receive-players-data", clientData);
    });

    socket.on('player-input', async (roomId, playerId, cellId) => {
        const [clients, clientData] = await getClients(roomId);

        if(!clients[0].roomData.matchDone)
        {
            let currentPlayer;

            //map 0-8 to [x][y]
            let x, y;
            if(cellId <= 2)
            {
                x = 0;
                y = cellId;
            }
            else if(cellId >= 3 && cellId <= 5)
            {
                x = 1;
                y = cellId-3;
            }
            else if(cellId >= 6 && cellId <= 8)
            {
                x = 2;
                y = cellId - 6;
            }
    
            //update table
            for(let client in clients)
            {
                if(clients[client].playerData.playerId == playerId)
                {
                    let playerTeam = clients[client].playerData.team;
                    currentPlayer = clients[client];
    
                    if(playerTeam == clients[0].roomData.currentTurn)
                    {
                        if(clients[0].roomData.table[x][y] == "fa-solid fa-bars cell")
                        {
                            if(playerTeam == "X")
                            {
                                clients[0].roomData.table[x][y] = "fa-solid fa-x cell";
                            }
                            else
                            {
                                clients[0].roomData.table[x][y] = "fa-solid fa-o cell";
                            }
                        }
                        else
                        {
                            return;
                        }
                    }
                    else
                    {
                        return;
                    }
                }
            }
    
            //change turn
            if(clients[0].roomData.currentTurn == "X")
            {
                clients[0].roomData.currentTurn = "O";
            }
            else
            {
                clients[0].roomData.currentTurn = "X";
            }

            let table = clients[0].roomData.table;

            let checker = [];
            //check for rows
            for(let i = 0; i < table.length; i++)
            {   
                checker.push(table[x][i]);
            }

            if(checker.every(elem => elem == "fa-solid fa-x cell") || checker.every(elem => elem == "fa-solid fa-o cell"))
            {
                clients[0].roomData.matchDone = true;
                clients[0].roomData.winner = currentPlayer.playerData.playerName;
                io.in(roomId).emit("receive-game-data", clients[0].roomData);
                return;
            }

            checker = [];

            //check for columns
            for(let i = 0; i < table.length; i++)
            {   
                checker.push(table[i][y]);
            }

            if(checker.every(elem => elem == "fa-solid fa-x cell") || checker.every(elem => elem == "fa-solid fa-o cell"))
            {
                clients[0].roomData.matchDone = true;
                clients[0].roomData.winner = currentPlayer.playerData.playerName;
                io.in(roomId).emit("receive-game-data", clients[0].roomData);
                return;
            }

            checker = [];

            //check diagonals
            for(let i = 0; i < table.length; i++)
            {   
                checker.push(table[i][i]);
            }

            if(checker.every(elem => elem == "fa-solid fa-x cell") || checker.every(elem => elem == "fa-solid fa-o cell"))
            {
                clients[0].roomData.matchDone = true;
                clients[0].roomData.winner = currentPlayer.playerData.playerName;
                io.in(roomId).emit("receive-game-data", clients[0].roomData);
                return;
            }

            checker = [];

            for(let i = 0; i < table.length; i++)
            {   
                checker.push(table[i][(table.length-1) - i]);
            }

            if(checker.every(elem => elem == "fa-solid fa-x cell") || checker.every(elem => elem == "fa-solid fa-o cell"))
            {
                clients[0].roomData.matchDone = true;
                clients[0].roomData.winner = currentPlayer.playerData.playerName;
                io.in(roomId).emit("receive-game-data", clients[0].roomData);
                return;
            }


            if(clients[0].roomData.table.flat().every(elem => elem != "fa-solid fa-bars cell"))
            {
                clients[0].roomData.matchDone = true;
                clients[0].roomData.winner = "Draw";
            }
    
            io.in(roomId).emit("receive-game-data", clients[0].roomData);
        }
        
    });
})

// Catchall
app.get("*", function (req, res) {
    res.send("page not found");
});

httpServer.listen(PORT);