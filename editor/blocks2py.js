
class Builder {
	constructor() {
		this.content = [];
		this.indentationLevel = 0;
	}
	indent() {
		for (let i = 0; i < this.indentationLevel; i++) {
			this.append("    ");
		}
		return this;
	}
	append(str) {
		this.content.push(str);
		return this;
	}
	newline() {
		this.content.push("\n");
		return this;
	}
	incrementLevel(fn) {
		let level = 1;
		this.indentationLevel += level;
		fn();
		this.indentationLevel -= level;
		return this;
	}
	appendLine(str) {
		this.append(str);
		this.newline();
		return this;
	}
	appendLines(strs) {
		if (!Array.isArray(strs)) { strs = arguments; }
		for (let i = 0; i < strs.length; i++) {
			this.appendLine(strs[i]);
		}
		return this;
	}
	toString() {
		return this.content.join("");
	}
}

let BlocksToPy = (function () {
	let topLevelBlocks = ["simulator_setup", "simulator_loop",
												"proc_definition_0args", "proc_definition_1args",
												"proc_definition_2args", "proc_definition_3args",
												"func_definition_0args", "func_definition_1args",
												"func_definition_2args", "func_definition_3args"];
	let dispatchTable =  {
		simulator_setup: function (block, ctx) {
			let stmts = getStatements(block, name);
			stmts.forEach(stmt => generateCodeFor(stmt, ctx));
			if (stmts.length > 0) { ctx.builder.newline(); }
		},
		simulator_loop: function (block, ctx) {
			ctx.builder.indent()
				.appendLine("while robot.step(TIME_STEP) != -1:")
				.incrementLevel(() => {
					generateCodeForStatements(block, ctx, "statements");
				});
		},
		forever: function (block, ctx) {
			ctx.builder.indent().appendLine("while true:")
				.incrementLevel(() => {
					generateCodeForStatements(block, ctx, "statements");
				});
		},
		for: function (block, ctx) {
			let variableName = asIdentifier(XML.getChildNode(block, "variableName").innerText);
			ctx.builder.indent().append("for ").append(variableName).append(" in range(");
			generateCodeForValue(block, ctx, "start");
			ctx.builder.append(", ");
			generateCodeForValue(block, ctx, "stop");
			ctx.builder.append(", ");
			generateCodeForValue(block, ctx, "step");
			ctx.builder.appendLine("):");
			ctx.builder.incrementLevel(() => {
				generateCodeForStatements(block, ctx, "statements");
			});
		},
		number: function (block, ctx) {
			let value = parseFloat(XML.getChildNode(block, "value").innerText);
			ctx.builder.append(value.toString());
		},
		variable: function (block, ctx) {
			let variableName = asIdentifier(XML.getChildNode(block, "variableName").innerText);
			ctx.builder.append(variableName);
		},
		conditional_simple: function (block, ctx) {
			ctx.builder.indent().append("if ");
			generateCodeForValue(block, ctx, "condition");
			ctx.builder.appendLine(":")
				.incrementLevel(() => {
					generateCodeForStatements(block, ctx, "trueBranch");
				});
		},
		conditional_full: function (block, ctx) {
			ctx.builder.indent().append("if ");
			generateCodeForValue(block, ctx, "condition");
			ctx.builder.appendLine(":")
				.incrementLevel(() => {
					generateCodeForStatements(block, ctx, "trueBranch");
				});
			ctx.builder.indent().appendLine("else:")
				.incrementLevel(() => {
					generateCodeForStatements(block, ctx, "falseBranch");
				});
		},
		logical_compare: function (block, ctx) {
			let type = XML.getChildNode(block, "operator").innerText;
			let valid = ["==", "!=", "<", "<=", ">", ">="];
			if (!valid.includes(type)) {
				throw "Logical operator not found: '" + type + "'";
			}
			let selector = type;
			ctx.builder.append("(");
			generateCodeForValue(block, ctx, "left");
			ctx.builder.append(" " + selector + " ");
			generateCodeForValue(block, ctx, "right");
			ctx.builder.append(")");
		},
		logical_operation: function (block, ctx) {
			let type = XML.getChildNode(block, "operator").innerText;
			ctx.builder.append("(");
			generateCodeForValue(block, ctx, "left");
			if (type === "and") {
				ctx.builder.append(" and ");
			} else if (type === "or") {
				ctx.builder.append(" or ");
			} else {
				throw "Invalid logical operator found: '" + type + "'";
			}
			generateCodeForValue(block, ctx, "right");
			ctx.builder.append(")");
		},
		boolean: function (block, ctx) {
			let bool = XML.getChildNode(block, "value").innerText;
			ctx.builder.append(bool == "true" ? "True" : "False");
		},
		logical_not: function (block, ctx) {
			ctx.builder.append("not ");
			generateCodeForValue(block, ctx, "value");
		},
		number_property: function (block, ctx) {
			let type = XML.getChildNode(block, "property").innerText;
			let valid = ["even", "odd", "positive", "negative"];
			if (!valid.includes(type)) {
				throw "Math number property not found: '" + type + "'";
			}
			ctx.builder.append("(");
			generateCodeForValue(block, ctx, "value");
			if (type === "even") {
				ctx.builder.append(" % 2 == 0");
			} else if (type === "odd") {
				ctx.builder.append(" % 2 != 0");
			} else if (type === "positive") {
				ctx.builder.append(" >= 0");
			} else if (type === "negative") {
				ctx.builder.append(" < 0");
			}
			ctx.builder.append(")");
		},
		number_divisibility: function (block, ctx) {
			ctx.builder.append("(");
			generateCodeForValue(block, ctx, "left");
			ctx.builder.append(" % ");
			generateCodeForValue(block, ctx, "right");
			ctx.builder.append(" == 0");
			ctx.builder.append(")");
		},
		number_round: function (block, ctx) {
			let type = XML.getChildNode(block, "operator").innerText;
			let valid = ["round", "ceil", "floor"];
			if (!valid.includes(type)) {
				throw "Math round type not found: '" + type + "'";
			}
			if (type == "round") {
				ctx.builder.append("round(");
			} else if (type == "ceil") {
				ctx.builder.append("ceil(");
			} else if (type == "floor") {
				ctx.builder.append("floor(");
			}
			generateCodeForValue(block, ctx, "number");
			ctx.builder.append(")");

			if (type != "round") {
				ctx.imports.add("from math import *");
			}
		},
		number_operation: function (block, ctx) {

			let type = XML.getChildNode(block, "operator").innerText;
			let valid = ["sqrt", "abs", "negate", "ln", "log10", "exp", "pow10"];
			if (!valid.includes(type)) {
				throw "Math function not found: '" + type + "'";
			}

			let num = () => generateCodeForValue(block, ctx, "number");
			if (type === "sqrt") { // sqrt(num)
				ctx.builder.append("sqrt(")
				num();
				ctx.builder.append(")");
			} else if (type === "abs") { // fabs(num)
				ctx.builder.append("fabs(")
				num();
				ctx.builder.append(")");
			} else if (type === "negate") { // num * -1
				ctx.builder.append("(");
				num();
				ctx.builder.append("* -1)");
			} else if (type === "ln") { // log(num)
				ctx.builder.append("log(");
				num();
				ctx.builder.append(")");
			} else if (type === "log10") { // log10(num)
				ctx.builder.append("log10(");
				num();
				ctx.builder.append(")");
			} else if (type === "exp") { // exp(num)
				ctx.builder.append("exp(");
				num();
				ctx.builder.append(")");
			} else if (type === "pow10") { // pow(10, num)
				ctx.builder.append("pow(10, ");
				num();
				ctx.builder.append(")");
			}

			if (type != "negate") {
				ctx.imports.add("from math import *");
			}
		},
		number_trig: function (block, ctx) {
			let type = XML.getChildNode(block, "operator").innerText;
			let valid = ["sin", "cos", "tan", "asin", "acos", "atan"];
			if (!valid.includes(type)) {
				throw "Math trig function not found: '" + type + "'";
			}
			ctx.builder.append(type);
			ctx.builder.append("(");
			generateCodeForValue(block, ctx, "number");
			ctx.builder.append(")");
		},
		math_constant: function (block, ctx) {
			let id = XML.getId(block);
			let type = XML.getChildNode(block, "constant").innerText;
			let value;
			if (type === "PI") {
				value = Math.PI;
			} else if (type === "E") {
				value = Math.E;
			} else if (type === "GOLDEN_RATIO") {
				value = 1.61803398875;
			} else if (type === "SQRT2") {
				value = Math.SQRT2;
			} else if (type === "SQRT1_2") {
				value = Math.SQRT1_2;
			} else if (type === "INFINITY") {
				value = 'float("inf")';
			} else {
				throw "Math constant not found: '" + type + "'";
			}
			ctx.builder.append(value.toString());
		},
		math_arithmetic: function (block, ctx) {
			let id = XML.getId(block);
			let type = XML.getChildNode(block, "operator").innerText;
			let selector;
			if (type === "DIVIDE") {
				selector = " / ";
			} else if (type === "MULTIPLY") {
				selector = " * ";
			} else if (type === "MINUS") {
				selector = " - ";
			} else if (type === "ADD") {
				selector = " + ";
			} else if (type === "POWER") {
				selector = " ** ";
			} else {
				throw "Math arithmetic function not found: '" + type + "'";
			}

			ctx.builder.append("(");
			generateCodeForValue(block, ctx, "left");
			ctx.builder.append(selector);
			generateCodeForValue(block, ctx, "right");
			ctx.builder.append(")");
		},
		repeat: function (block, ctx) {
			let negated = XML.getChildNode(block, "negate").innerText === "true";
			ctx.builder.indent().append("while ");
			if (negated) { ctx.builder.append("not "); }
			generateCodeForValue(block, ctx, "condition");
			ctx.builder.appendLine(":");
			ctx.builder.incrementLevel(() => {
				generateCodeForStatements(block, ctx, "statements");
			});
		},
		wait: function (block, ctx) {
			let negated = XML.getChildNode(block, "negate").innerText === "true";
			ctx.builder.indent().append("while ");
			if (negated) { ctx.builder.append("not "); }
			generateCodeForValue(block, ctx, "condition");
			ctx.builder.appendLine(":")
				.incrementLevel(() => ctx.builder.indent().appendLine("pass"));
		},
		number_modulo: function (block, ctx) {
			ctx.builder.append("(");
			generateCodeForValue(block, ctx, "dividend");
			ctx.builder.append(" % ");
			generateCodeForValue(block, ctx, "divisor");
			ctx.builder.append(")");
		},
		set_variable: function (block, ctx) {
			let name = asIdentifier(XML.getChildNode(block, "variableName").innerText);
			ctx.builder.indent().append(name).append(" = ");
			generateCodeForValue(block, ctx, "value");
			ctx.builder.newline();
		},
		increment_variable: function (block, ctx) {
			let name = asIdentifier(XML.getChildNode(block, "variableName").innerText);
			ctx.builder.indent().append(name).append(" = ").append(name).append(" + ");
			generateCodeForValue(block, ctx, "value");
			ctx.builder.newline();
		},
		number_random_int: function (block, ctx) {
			ctx.builder.append("randint(");
			generateCodeForValue(block, ctx, "from");
			ctx.builder.append(", ");
			generateCodeForValue(block, ctx, "to");
			ctx.builder.append(")");

			ctx.imports.add("from random import *");
		},
		number_random_float: function (block, ctx) {
			ctx.builder.append("random()");

			ctx.imports.add("from random import *");
		},
		proc_definition_0args: function (block, ctx) {
			let name = asIdentifier(XML.getChildNode(block, "procName").innerText);
			ctx.builder.append("def ").append(name).appendLine("():");
			ctx.builder.incrementLevel(() => {
				generateCodeForStatements(block, ctx, "statements");
			});
			ctx.builder.newline();
		},
		proc_definition_1args: function (block, ctx) {
			let name = asIdentifier(XML.getChildNode(block, "procName").innerText);
			let args = [asIdentifier(XML.getChildNode(block, "arg0").innerText)];

			ctx.builder.append("def ").append(name).append("(");
			args.forEach((arg, i) => {
				if (i > 0) { ctx.builder.append(", "); }
				ctx.builder.append(arg);
			})
			ctx.builder.appendLine("):");
			ctx.builder.incrementLevel(() => {
				generateCodeForStatements(block, ctx, "statements");
			});
			ctx.builder.newline();
		},
		proc_definition_2args: function (block, ctx) {
			let name = asIdentifier(XML.getChildNode(block, "procName").innerText);
			let args = [asIdentifier(XML.getChildNode(block, "arg0").innerText),
									asIdentifier(XML.getChildNode(block, "arg1").innerText)];

			ctx.builder.append("def ").append(name).append("(");
			args.forEach((arg, i) => {
				if (i > 0) { ctx.builder.append(", "); }
				ctx.builder.append(arg);
			})
			ctx.builder.appendLine("):");
			ctx.builder.incrementLevel(() => {
				generateCodeForStatements(block, ctx, "statements");
			});
			ctx.builder.newline();
		},
		proc_definition_3args: function (block, ctx) {
			let name = asIdentifier(XML.getChildNode(block, "procName").innerText);
			let args = [asIdentifier(XML.getChildNode(block, "arg0").innerText),
									asIdentifier(XML.getChildNode(block, "arg1").innerText),
									asIdentifier(XML.getChildNode(block, "arg2").innerText)];

			ctx.builder.append("def ").append(name).append("(");
			args.forEach((arg, i) => {
				if (i > 0) { ctx.builder.append(", "); }
				ctx.builder.append(arg);
			});
			ctx.builder.appendLine("):");
			ctx.builder.incrementLevel(() => {
				generateCodeForStatements(block, ctx, "statements");
			});
			ctx.builder.newline();
		},
		proc_call_0args: function (block, ctx) {
			let procName = asIdentifier(XML.getChildNode(block, "procName").innerText);
			ctx.builder.indent().append(procName).appendLine("()");
		},
		proc_call_1args: function (block, ctx) {
			let procName = asIdentifier(XML.getChildNode(block, "procName").innerText);
			let args = ["arg0"];
			ctx.builder.indent().append(procName).append("(");
			args.forEach((arg, i) => {
				if (i > 0) { ctx.builder.append(", "); }
				generateCodeForValue(block, ctx, arg);
			})
			ctx.builder.appendLine(")");
		},
		proc_call_2args: function (block, ctx) {
			let procName = asIdentifier(XML.getChildNode(block, "procName").innerText);
			let args = ["arg0", "arg1"];
			ctx.builder.indent().append(procName).append("(");
			args.forEach((arg, i) => {
				if (i > 0) { ctx.builder.append(", "); }
				generateCodeForValue(block, ctx, arg);
			})
			ctx.builder.appendLine(")");
		},
		proc_call_3args: function (block, ctx) {
			let procName = asIdentifier(XML.getChildNode(block, "procName").innerText);
			let args = ["arg0", "arg1", "arg2"];
			ctx.builder.indent().append(procName).append("(");
			args.forEach((arg, i) => {
				if (i > 0) { ctx.builder.append(", "); }
				generateCodeForValue(block, ctx, arg);
			})
			ctx.builder.appendLine(")");
		},
		func_definition_0args: function (block, ctx) {
			let name = asIdentifier(XML.getChildNode(block, "funcName").innerText);
			ctx.builder.append("def ").append(name).appendLine("():");
			ctx.builder.incrementLevel(() => {
				generateCodeForStatements(block, ctx, "statements");
			});
			ctx.builder.newline();
		},
		func_definition_1args: function (block, ctx) {
			let name = asIdentifier(XML.getChildNode(block, "funcName").innerText);
			let args = [asIdentifier(XML.getChildNode(block, "arg0").innerText)];

			ctx.builder.append("def ").append(name).append("(");
			args.forEach((arg, i) => {
				if (i > 0) { ctx.builder.append(", "); }
				ctx.builder.append(arg);
			})
			ctx.builder.appendLine("):");
			ctx.builder.incrementLevel(() => {
				generateCodeForStatements(block, ctx, "statements");
			});
			ctx.builder.newline();
		},
		func_definition_2args: function (block, ctx) {
			let name = asIdentifier(XML.getChildNode(block, "funcName").innerText);
			let args = [asIdentifier(XML.getChildNode(block, "arg0").innerText),
									asIdentifier(XML.getChildNode(block, "arg1").innerText)];

			ctx.builder.append("def ").append(name).append("(");
			args.forEach((arg, i) => {
				if (i > 0) { ctx.builder.append(", "); }
				ctx.builder.append(arg);
			})
			ctx.builder.appendLine("):");
			ctx.builder.incrementLevel(() => {
				generateCodeForStatements(block, ctx, "statements");
			});
			ctx.builder.newline();
		},
		func_definition_3args: function (block, ctx) {
			let name = asIdentifier(XML.getChildNode(block, "funcName").innerText);
			let args = [asIdentifier(XML.getChildNode(block, "arg0").innerText),
									asIdentifier(XML.getChildNode(block, "arg1").innerText),
									asIdentifier(XML.getChildNode(block, "arg2").innerText)];

			ctx.builder.append("def ").append(name).append("(");
			args.forEach((arg, i) => {
				if (i > 0) { ctx.builder.append(", "); }
				ctx.builder.append(arg);
			})
			ctx.builder.appendLine("):");
			ctx.builder.incrementLevel(() => {
				generateCodeForStatements(block, ctx, "statements");
			});
			ctx.builder.newline();
		},
		func_call_0args: function (block, ctx) {
			let funcName = asIdentifier(XML.getChildNode(block, "funcName").innerText);
			ctx.builder.append(funcName).append("()");
		},
		func_call_1args: function (block, ctx) {
			let funcName = asIdentifier(XML.getChildNode(block, "funcName").innerText);
			let args = ["arg0"];
			ctx.builder.append(funcName).append("(");
			args.forEach((arg, i) => {
				if (i > 0) { ctx.builder.append(", "); }
				generateCodeForValue(block, ctx, arg);
			})
			ctx.builder.append(")");
		},
		func_call_2args: function (block, ctx) {
			let funcName = asIdentifier(XML.getChildNode(block, "funcName").innerText);
			let args = ["arg0", "arg1"];
			ctx.builder.append(funcName).append("(");
			args.forEach((arg, i) => {
				if (i > 0) { ctx.builder.append(", "); }
				generateCodeForValue(block, ctx, arg);
			})
			ctx.builder.append(")");
		},
		func_call_3args: function (block, ctx) {
			let funcName = asIdentifier(XML.getChildNode(block, "funcName").innerText);
			let args = ["arg0", "arg1", "arg2"];
			ctx.builder.append(funcName).append("(");
			args.forEach((arg, i) => {
				if (i > 0) { ctx.builder.append(", "); }
				generateCodeForValue(block, ctx, arg);
			})
			ctx.builder.append(")");
		},
		return: function (block, ctx) {
			ctx.builder.indent().appendLine("return");
		},
		return_value: function (block, ctx) {
			ctx.builder.indent().append("return ");
			generateCodeForValue(block, ctx, "value");
			ctx.builder.newline();
		},
	};

	function asIdentifier(str) {
		return str.replace(/ /g, '_');
	}

	function generateCodeFor(block, ctx) {
		if (isDisabled(block)) return undefined;

		let type = block.getAttribute("type");
		let func = dispatchTable[type];
		if (func == undefined) {
			throw "CODEGEN ERROR: Type not found '" + type + "'";
		}
		try {
			ctx.path.push(block);
			func(block, ctx);
		}
		finally {
			ctx.path.pop();
		}
	}

	function generateCodeForValue(block, ctx, name) {
		let child = XML.getChildNode(block, name);
		if (child === undefined) return undefined;
		let valueBlock = block;
		try {
			valueBlock = XML.getLastChild(child);
			generateCodeFor(valueBlock, ctx);
		} catch (err) {
			ctx.registerError(valueBlock, err);
			return undefined;
		}
	}

	function generateCodeForStatements(block, ctx, name) {
		let stmts = getStatements(block, name);
		if (stmts.length == 0) {
			ctx.builder.indent().appendLine("pass");
		} else {
			stmts.forEach(stmt => {
				try {
					generateCodeFor(stmt, ctx);
				} catch (err) {
					ctx.registerError(block, err);
				}
			});
		}
	}

	function getStatements(block, name) {
		let child = XML.getChildNode(block, name || "statements");
		let stmts = [];
		if (child !== undefined) {
			child.childNodes.forEach(function (each) {
				let next = each;
				do {
					stmts.push(next);
					next = getNextStatement(next);
				} while (next !== undefined);
			});
		}
		return stmts;
	}

	function getNextStatement(block) {
		let next = XML.getLastChild(block, child => child.tagName === "NEXT");
		if (next === undefined) { return next; }
		return next.childNodes[0];
	}

	function isTopLevel(block) {
		return topLevelBlocks.indexOf(block.getAttribute("type")) != -1;
	}

	function isDisabled(block) {
		return block.getAttribute("disabled") === "true";
	}

	function isLoop(block) {
		return block.getAttribute("type") === "simulator_loop";
	}

	function isSetup(block) {
		return block.getAttribute("type") === "simulator_setup";
	}

	function assertValidBlocks(blocks, ctx) {
		let setupBlocks = blocks.filter(isSetup);
		for (let i = 1; i < setupBlocks.length; i++) {
			ctx.registerError(setupBlocks[i], 'Más de un bloque "setup"');
		}

		let loopBlocks = blocks.filter(isLoop);
		for (let i = 1; i < loopBlocks.length; i++) {
			ctx.registerError(loopBlocks[i], 'Más de un bloque "loop"');
		}
	}

	function error(msg, errors) {
		errors = errors || [];
		return {summary: msg, errors: errors};
	}

	return {
		generate: function (xml) {
			let ctx = {
				builder: new Builder(),
				path: [xml],
				imports: new Set(),
				errors: [],

				registerError: (block, msg) => {
					ctx.errors.push({block: block.getAttribute("id"), msg: msg});
				}
			};

			let blocks = Array.from(xml.childNodes).filter(isTopLevel);
			assertValidBlocks(blocks, ctx);

			blocks.sort((a, b) => {
				if (isLoop(b)) return -1;
				if (isLoop(a)) return 1;
				return 0;
			});

			blocks.forEach(function (block) {
				generateCodeFor(block, ctx);
			});

			if (ctx.errors.length > 0) {
				throw error("Se encontraron los siguientes errores:", ctx.errors);
			}

			return ["from controller import Robot, DistanceSensor, Motor"]
				.concat(Array.from(ctx.imports))
				.concat("",
								"TIME_STEP = 64",
								"MAX_SPEED = 6.28",
								"",
								"robot = Robot()",
								"",
								ctx.builder.toString())
				.join("\n");
		}
	}
})();
