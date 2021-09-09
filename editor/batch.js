const electron = require('electron');
const { dialog } = electron ? electron.remote : {};
const fs = require('fs');
var path = require('path');

class Output {
  constructor() {
    this.history = [];
  }

  clear() {
    $("#output-console").html("");
    this.history = [];
  }
  refresh() {
    let temp = this.history;
    this.clear();
    temp.forEach(entry => this.appendEntry(entry));
  }

  timestamp() {
    this.info((new Date()).toLocaleString());
  }

  exception(err) {
    let text = err["summary"];
    if (text) {
      this.appendEntry({type: "error", text: text});
      let errors = err["errors"];
      if (errors) {
        for (let i = 0; i < errors.length; i++) {
          this.appendEntry({type: "error", text: "[" + (i + 1) + "] " + errors[i]["msg"]});
        }
      }
    } else {
      this.appendEntry({type: "error", text: err.toString()});
    }
    this.newline();
  }

  newline() {
    this.appendEntry({type: "info", text: ""});
  }

  info(msg) {
    this.appendEntry({type: "info", text: msg});
  }
  success(msg) {
    this.appendEntry({type: "success", text: msg});
  }
  error(msg) {
    this.appendEntry({type: "error", text: msg});
  }
  appendEntry(entry) {
    // Remember the entry in case we need to update the panel (up to a fixed limit)
    if (this.history.length == 100) { this.history.shift(); }
    this.history.push(entry);

    // Translate and format the message
    let type = entry.type || "info";
    let args = entry.args || [];
    let regex = /%(\d+)/g;
    let text = entry.text.replace(regex, function (m, i) {
      let arg = args[parseInt(i) - 1];
      return arg || m;
    });

    // Append element
    let css = {
      info: "text-dark",
      success: "text-success",
      error: "text-danger",
      warning: "text-warning"
    };
    let el = $("<div>").addClass("small").addClass(css[type]);
    if (text) { el.text(text); }
    else { el.html("&nbsp;"); }
    $("#output-console").append(el);
  }
}

let folder = "";
let files = [];
let output = new Output();
let running = false;

UziBlock.init();
setInterval(update, 100);

$("#open-button").on("click", openFolder);
$("#go-button").on("click", go);

function update() {
  $("#path").val(folder);

  if (running) {
    $("#open-button").attr("disabled", "disabled");
    $("#go-button").attr("disabled", "disabled");
  } else {
    $("#open-button").attr("disabled", null);
    if (!folder) {
      $("#go-button").attr("disabled", "disabled");
    } else {
      $("#go-button").attr("disabled", null);
    }
  }

  if (files) {
    output.clear();
    if (files.length == 0) {
      output.info("No files found");
    } else if (files.length == 1) {
      output.info("1 file found!");
    } else {
      output.info(files.length + " files found!");
    }
    output.newline();

    let max = Math.max.apply(null, files.map(f => f.name.length));
    let width = max >= 60 ? max + 10 : 70;

    function pad(str) {
      while (str.length < width) {
        str += ".";
      }
      return str;
    }

    files.forEach((f, i) => {
      if (f.status) {
        let paddedName = pad((i + 1) + ") " + f.name);
        if (f.status == "OK") {
          output.success(paddedName + "OK");
        } else {
          output.error(paddedName + f.status);
        }
      } else {
        output.info((i + 1) + ") " + f.name);
      }
    });
  }
}

function openFolder() {
  dialog.showOpenDialog({
    properties: ["openDirectory"]
  }).then(function (response) {
    console.log(response);
    if (response.canceled) return;
    folder = response.filePaths[0];
    walk(folder, (err, data) => {
      console.log(data);
      files = data.filter(f => f.endsWith(".blocks")).map(f => ({name: f, status: null}));
    });
  });
}

function go() {
  running = true;
  files.forEach(f => f.status = null);

  let i = 0;
  function next() {
    if (i < files.length) {
      let file = files[i];
      process(file).finally(() => {
        i++;
        setTimeout(next, 1);
      })
    } else {
      running = false;
    }
  }
  setTimeout(next, 1);
}


function process(file) {
  let parts = file.name.split(/[\\.]/);
  //let folderName = parts[parts.length - 3];
  let robotName = parts[parts.length - 2];
  return fs.promises.readFile(file.name)
    .then(contents => JSON.parse(contents))
    .then(data => generateCode(robotName, data))
    .then(code => writeCodeFile(file, robotName, code))
    .catch(err => {
      file.status = "ERROR";
      console.log("ERROR: " + file.name);
      console.log(err);
      return false;
    });
}

function generateCode(robotName, data) {
  return new Promise((resolve, reject) => {
    UziBlock.setDataFromStorage(data);
    setTimeout(() => {
      try {
        let code = UziBlock.getGeneratedCode(robotName);
        resolve(code);
      } catch (err) {
        reject(err);
      }
    }, 50);
  });
}

function writeCodeFile(file, robotName, src) {
  let codePath = file.name.substr(0, file.name.lastIndexOf("\\")) + "\\" + robotName + ".py";
  fs.promises.readFile(codePath)
    .then(contents => {
      if (src != contents) {
        console.error("The file already exists and they don't match! (" + file.name + ")");
        file.status = "ERROR";
        return false;
      } else {
        return fs.promises.writeFile(codePath, src).then(() => {
          file.status = "OK";
          return true;
        });
      }
    })
    .catch(err => {
      return fs.promises.writeFile(codePath, src).then(() => {
        file.status = "OK";
        return true;
      });
    })
}


var walk = function(dir, done) {
  var results = [];
  fs.readdir(dir, function(err, list) {
    if (err) return done(err);
    var i = 0;
    (function next() {
      var file = list[i++];
      if (!file) return done(null, results);
      file = path.resolve(dir, file);
      fs.stat(file, function(err, stat) {
        if (stat && stat.isDirectory()) {
          walk(file, function(err, res) {
            results = results.concat(res);
            next();
          });
        } else {
          results.push(file);
          next();
        }
      });
    })();
  });
};
