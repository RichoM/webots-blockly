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
        .then(initializeBlocklyVariablesModal)
        .then(initializeCodePanel)
        .then(initializeAutorun)
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


  function initializeBlocklyVariablesModal() {
    function getFormData() {
      let data = $("#blockly-variables-modal-container").serializeJSON();
      if (data.variables == undefined) return [];
      return Object.keys(data.variables).map(k => data.variables[k]);
    }

    function validateForm() {
      let inputs = $("#blockly-variables-modal").find("[name*='[name]']");
      inputs.each(function () { this.classList.remove("is-invalid"); });

      let valid = true;
      let regex = /^[a-zA-Z_][a-zA-Z_0-9]*$/;
      for (let i = 0; i < inputs.length; i++) {
        let input_i = inputs.get(i);

        // Check valid identifier
        if (!regex.test(input_i.value)) {
          input_i.classList.add("is-invalid");
          valid = false;
        }

        // Check for duplicates
        for (let j = i + 1; j < inputs.length; j++) {
          let input_j = inputs.get(j);

          if (input_i.value == input_j.value) {
            input_i.classList.add("is-invalid");
            input_j.classList.add("is-invalid");
            valid = false;
          }
        }
      }
      return valid;
    }

    function getDefaultVariable() {
      let data = getFormData();
      let variableNames = new Set(data.map(m  => m.name));
      let variable = {name: "variable"};
      let i = 1;
      while (variableNames.has(variable.name)) {
        variable.name = "variable" + i;
        i++;
      }
      return variable;
    }

    function appendVariableRow(i, variable, usedVariables) {

      function createTextInput(controlValue, controlName, validationFn) {
        let input = $("<input>")
          .attr("type", "text")
          .addClass("form-control")
          .addClass("text-center")
          .css("padding-right", "initial") // Fix for weird css alignment issue when is-invalid
          .attr("name", controlName);
        if (validationFn != undefined) {
          input.on("keyup", validationFn);
        }
        input.get(0).value = controlValue;
        return input;
      }
      function createRemoveButton(row) {
        let btn = $("<button>")
          .addClass("btn")
          .addClass("btn-sm")
          .attr("type", "button")
          .append($("<i>")
            .addClass("fas")
            .addClass("fa-minus"));

        if (usedVariables.has(variable.name)) {
          btn
            //.attr("disabled", "true")
            .addClass("btn-outline-secondary")
            .attr("data-toggle", "tooltip")
            .attr("data-placement", "left")
            .attr("title", i18n.translate("This variable is being used by the program!"))
            .on("click", function () {
              btn.tooltip("toggle");
            });
        } else {
          btn
            .addClass("btn-outline-danger")
            .on("click", function () { row.remove(); validateForm(); });
        }
        return btn;
      }
      let tr = $("<tr>")
        .append($("<input>").attr("type", "hidden").attr("name", "variables[" + i + "][index]").attr("value", i))
        .append($("<td>").append(createTextInput(variable.name, "variables[" + i + "][name]", validateForm)))
      tr.append($("<td>").append(createRemoveButton(tr)));
      $("#blockly-variables-modal-container-tbody").append(tr);
    }

    $("#add-variable-row-button").on("click", function () {
      let data = getFormData();
      let nextIndex = data.length == 0 ? 0: 1 + Math.max.apply(null, data.map(m => m.index));
      appendVariableRow(nextIndex, getDefaultVariable(), UziBlock.getUsedVariables());
    });

    UziBlock.getWorkspace().registerButtonCallback("configureVariables", function () {
      // Build modal UI
      $("#blockly-variables-modal-container-tbody").html("");
      let allVariables = UziBlock.getVariables();
      let usedVariables = UziBlock.getUsedVariables();
      if (allVariables.length == 0) {
        appendVariableRow(0, getDefaultVariable(), usedVariables);
      } else {
        allVariables.forEach(function (variable, i) {
          appendVariableRow(i, variable, usedVariables);
        });
      }
      $("#blockly-variables-modal").modal("show");
      validateForm();
    });

    $("#blockly-variables-modal").on("hide.bs.modal", function (evt) {
      if (!validateForm()) {
        evt.preventDefault();
        evt.stopImmediatePropagation();
        return;
      }

      let data = getFormData();
      UziBlock.setVariables(data);
      UziBlock.refreshToolbox();
      saveToLocalStorage();
    });

    $("#blockly-variables-modal-container").on("submit", function (e) {
      e.preventDefault();
      $("#blockly-variables-modal").modal("hide");
    });
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
		if (autorunNextTime === undefined) return;

		let currentTime = +new Date();
		if (currentTime < autorunNextTime) return;
    autorunNextTime = undefined;

		let currentProgram = getGeneratedCodeAsJSON();
		if (currentProgram === lastProgram) return;
    lastProgram = currentProgram;

    let src = currentProgram;
    if (codeEditor.getValue() !== src) {
      codeEditor.setValue(src, 1);
    }
	}

  function getGeneratedCodeAsJSON() { // TODO(RIcho): Return python?
    let code = UziBlock.getGeneratedCode();
    return JSON.stringify(code);
  }

  return IDE;
})();
