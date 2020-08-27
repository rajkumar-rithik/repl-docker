const express = require('express');
const app = express();
const https = require('https');
const spawn = require('child_process').spawn;
var kill  = require('tree-kill');
var fs = require("fs");
const { uuid } = require('uuidv4');
const { exec } = require("child_process");
var moment = require('moment-timezone');

const server = https.createServer({
                key: fs.readFileSync('/root/online-ide.pem'),
                cert: fs.readFileSync('/root/online-ide.crt'),
                autoRewrite: true,
                changeOrigin: true,
                ws: true,
                requestCert: false,
                rejectUnauthorized: false
             }, app);

const io = require('socket.io')(server);

let onlineClients = new Set();

function onReplConnection(socket, lang) {
    console.log(`${moment.tz('UTC').format('YYYY-MM-DD HH:mm:ss')} - Socket ${socket.id} has connected.`);
    onlineClients.add(socket.id);
    let allowed_size_mb = 2;
    let allowed_size = 1024 * 1024 * allowed_size_mb;
    let timeout = 300;
    let out_size = 0;
    let pid;
    let cwd = '/home/repl/' + uuid() + '/';
    let sh;

    fs.mkdirSync(cwd);

    exec("chmod 775 " + cwd, (error, stdout, stderr) => {
        if (error) {
            console.log(`${moment.tz('UTC').format('YYYY-MM-DD HH:mm:ss')} - error: ${error.message}`);
            return;
        }
        if (stderr) {
            console.log(`${moment.tz('UTC').format('YYYY-MM-DD HH:mm:ss')} - stderr: ${stderr}`);
            return;
        }
        // console.log(`stdout: ${stdout}`);
    });

    socket.on("disconnect", () => {
        fs.rmdirSync(cwd, { recursive: true });
        if (pid !== undefined && pid !== null) {
          kill(pid);
        }
        onlineClients.delete(socket.id);
        console.log(`${moment.tz('UTC').format('YYYY-MM-DD HH:mm:ss')} - Socket ${socket.id} has disconnected.`);
    });

    socket.on('code', function(code, arg, active_filename) {
      let python_unbuffer = false;
      for (let i = 0; i < code.length; i++) {
        if (code[i]['file_name'] === undefined or code[i]['file_name'] === null) {
          socket.emit('exit', '\n\nSource code file name is invalid. Process Killed.', 1000);
          socket.disconnect();
          break;
        }
        let writeStream = fs.createWriteStream(cwd + code[i]['file_name']);
        writeStream.write(code[i]['code']);
        if (code[i]['code'].includes('sleep') && code[i]['file_name'] === active_filename)
        {
          python_unbuffer = true;
        }
      }

      let script = active_filename;
      let file_out = active_filename + '.out';
      let java_out = active_filename.replace('.java', '');

      cmd_exe = {
        "python3": `python3 ${script}`,
        "php": `php -f ${script}`,
        "c": `gcc -o ${file_out} *.c && stdbuf -i0 -o0 -e0 ./${file_out}`,
        "cpp": `g++ -o ${file_out} *.cpp && stdbuf -i0 -o0 -e0 ./${file_out}`,
        "java": `javac ${script} && java ${java_out}`,
        "ruby": `ruby ${script}`,
        "rlang": `Rscript ${script}`,
        "golang": `go run ${script}`,
        "bash": `sh ${script}`,
      };

      if (python_unbuffer === true) {
        cmd_exe['python3'] = `python3 -u ${script}`;
      }

      arg = arg.replace(/([^0-9A-Za-z ])/g, "\\$1");
      sh = spawn('su', ['repl', '-c', cmd_exe[lang] + ' ' + arg], {cwd: cwd, stdin: "ignore"});
      pid = sh.pid;

      socket.on('message', function(data){
        sh.stdin.setEncoding('utf-8');
        sh.stdin.write(data + "\n");
        socket.emit('input', Buffer.from("\n" + data + "\n", 'utf-8'));
        // console.log("in", data);
      });

      sh.stdout.on('data', function(data) {
        socket.emit('output', data);
        // console.log("out", String.fromCharCode.apply(null, new Uint8Array(data)).length);
        out_size += data.length;
        if (out_size > allowed_size) {
          socket.emit('exit', '\n\nOutput Size exceeded '+ allowed_size_mb +'MB. Process Killed.', 1000);
          socket.disconnect();
        }
      });

      sh.stderr.on('data', function(data) {
        socket.emit('err', data);
        // console.log("err", String.fromCharCode.apply(null, new Uint8Array(data)));
      });

      sh.on('exit', function (code) {
        if (code !== null && code !== undefined) {
          socket.emit('exit', '\n\n** Process exited - Return Code: '+code+' **', code);
        } else {
          socket.emit('exit', '\n\n** Process exited due to resource limitations **', code);
        }
        socket.disconnect();
      });
    });

    setTimeout(function () {
      socket.emit('exit', '\n\nSession Killed due to Timeout.', 1000);
      socket.disconnect();
    }, 1000 * timeout);
}

app.use(express.static('./'))

io.on("connection", function(socket) {
  console.log(`${moment.tz('UTC').format('YYYY-MM-DD HH:mm:ss')} - Language: ${socket.handshake.query['lang']}`);
  onReplConnection(socket, socket.handshake.query['lang']);
});


server.listen(8443, function(){
  console.log(`${moment.tz('UTC').format('YYYY-MM-DD HH:mm:ss')} - server started`);
});
