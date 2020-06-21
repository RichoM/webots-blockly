let IDE = (function () {

  let layout, defaultLayoutConfig;
  let codeEditor;
  let autorunInterval, autorunNextTime;
  let lastProgram;
  let lastFileName;
  let outputHistory = [];

  let userPorts = [];

  // HACK(Richo): To disable some controls while we're waiting for a connection
  let connecting = false;

  let IDE = {
    init: function () {
      // NOTE(Richo): The following tasks need to be done in order:
      loadDefaultLayoutConfig()
        .then(initializeDefaultLayout)
        .then(initializeBlocksPanel)
        .then(initializeCodePanel)
        .then(initializeOutputPanel)
        .then(initializeInternationalization)
        .then(() => {
          setInterval(function () {
            let msg = (+new Date()) +  " RICHO CAPO!";
            appendToOutput({type: "info", text: msg});
            appendToOutput({type: "success", text: msg});
            appendToOutput({type: "error", text: msg});
            appendToOutput({type: "warning", text: msg});
            appendToOutput({type: "info", text: ""});
          }, 500);
        });
    },
  };

  function loadDefaultLayoutConfig() {
    return ajax.GET("default-layout.json")
      .then(function (data) { defaultLayoutConfig = data; });
  }

  function initializeDefaultLayout() {
    initializeLayout(defaultLayoutConfig);
  }

  function initializeLayout(config) {
    if (layout) { layout.destroy(); }
    layout = new GoldenLayout(config, "#layout-container");
    layout.registerComponent('DOM', function(container, state) {
      let $el = $(state.id);
      container.getElement().append($el);
      container.on('destroy', function () {
        $("#hidden-panels").append($el);
      });
    });

    function updateSize() {
      let w = window.innerWidth;
      let h = window.innerHeight - $("#top-bar").outerHeight();
      if (layout.width != w || layout.height != h) {
        layout.updateSize(w, h);
      }
    };

    window.onresize = updateSize;
    layout.on('stateChanged', updateSize);
    layout.on('stateChanged', resizeBlockly);
    layout.on('stateChanged', saveToLocalStorage);
    layout.on('stateChanged', checkBrokenLayout);
    layout.on('stateChanged', function () {
      // HACK(Richo): The following allows me to translate panel titles
      $(".lm_title").each(function () { $(this).attr("lang", "en"); });
      i18n.updateUI();
    });
    layout.init();
    updateSize();
    resizeBlockly();
    checkBrokenLayout();
  }

  function initializeBlocksPanel() {
    return UziBlock.init()
      .then(function () {
          UziBlock.on("change", function () {
            saveToLocalStorage();
            scheduleAutorun(false);
          });
      })
      .then(restoreFromLocalStorage);
  }

  function initializeCodePanel() {
		codeEditor = ace.edit("code-editor");
		codeEditor.setTheme("ace/theme/chrome");
		codeEditor.getSession().setMode("ace/mode/python");
    codeEditor.setReadOnly(true); // TODO(Richo): Only for now...
  }

  function initializeOutputPanel() {
    i18n.on("change", function () {
      $("#output-console").html("");
      let temp = outputHistory;
      outputHistory = [];
      temp.forEach(appendToOutput);
    })
  }

  function initializeAutorun() {
    setInterval(autorun, 150);
  }

  function getNavigatorLanguages() {
    if (navigator.languages && navigator.languages.length) {
      return navigator.languages;
    } else {
      return navigator.userLanguage || navigator.language || navigator.browserLanguage;
    }
  }

  function initializeInternationalization() {
    let navigatorLanguages = getNavigatorLanguages();
    let defaultLanguage    = "es";
    let preferredLanguage  = undefined;

    i18n.init(TRANSLATIONS);

    for (let i = 0; i < navigatorLanguages.length; i++) {
      let languageCode = navigatorLanguages[i];
      if (i18n.availableLocales.includes(languageCode)) {
        preferredLanguage = languageCode;
        break;
      }
    }

    i18n.currentLocale(preferredLanguage || defaultLanguage);
    $("#spinner-container").hide();
  }

  function initializeBrokenLayoutErrorModal() {
    $("#fix-broken-layout-button").on("click", function () {
      initializeDefaultLayout();
      $("#broken-layout-modal").modal("hide");
    });
  }

  function checkBrokenLayout() {
    if (layout.config.content.length > 0) return;

    setTimeout(function () {
      if (layout.config.content.length > 0) return;
      $("#broken-layout-modal").modal("show");
    }, 1000);
  }

  function appendToOutput(entry) {
    // Remember the entry in case we need to update the panel (up to a fixed limit)
    if (outputHistory.length == 100) { outputHistory.shift(); }
    outputHistory.push(entry);

    // Translate and format the message
    let type = entry.type || "info";
    let args = entry.args || [];
    let regex = /%(\d+)/g;
    let text = i18n.translate(entry.text).replace(regex, function (m, i) {
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

    // Scroll to bottom
    let panel = $("#output-panel").get(0);
    panel.scrollTop = panel.scrollHeight - panel.clientHeight;
  }

  function resizeBlockly() {
    UziBlock.resizeWorkspace();
  }

	function restoreFromLocalStorage() {
    try {
      let ui = {
        layout: JSON.parse(localStorage["uzi.layout"] || "null"),
        blockly: JSON.parse(localStorage["uzi.blockly"] || "null"),
      };
      setUIState(ui);
    } catch (err) {
      console.log(err);
    }
	}

  function saveToLocalStorage() {
    if (UziBlock.getWorkspace() == undefined || layout == undefined) return;

    let ui = getUIState();
    localStorage["uzi.layout"] = JSON.stringify(ui.layout);
    localStorage["uzi.blockly"] = JSON.stringify(ui.blockly);
  }

  function getUIState() {
    return {
      layout: layout.toConfig(),
      blockly: UziBlock.getDataForStorage(),
    };
  }

  function setUIState(ui) {
    try {
      if (ui.layout) {
        initializeLayout(ui.layout);
      }

      if (ui.blockly) {
        UziBlock.setDataFromStorage(ui.blockly);
      }
    } catch (err) {
      console.error(err);
    }
  }

	function scheduleAutorun(forced) {
		let currentTime = +new Date();
		autorunNextTime = currentTime + 150;
    if (forced) { lastProgram = null; }
	}

  function success() {
    $(document.body).css("border", "4px solid black");
  }

  function error() {
    $(document.body).css("border", "4px solid red");
  }

	function autorun() {
    if (Uzi.state == undefined) return;
		if (autorunNextTime === undefined) return;

		let currentTime = +new Date();
		if (currentTime < autorunNextTime) return;
    autorunNextTime = undefined;

		let currentProgram = getGeneratedCodeAsJSON();
		if (currentProgram === lastProgram) return;
    lastProgram = currentProgram;

    // TODO(Richo): Update code panel
	}

  function getGeneratedCodeAsJSON() { // TODO(RIcho): Return python?
    let code = UziBlock.getGeneratedCode();
    return JSON.stringify(code);
  }

  return IDE;
})();
