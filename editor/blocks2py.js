
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
		delay: function (block, ctx) {
			let id = XML.getId(block);
			let unit = XML.getChildNode(block, "unit").innerText;
			let time = generateCodeForValue(block, ctx, "time");
			let selector;
			if (unit === "ms") { selector = "delayMs"; }
			else if (unit === "s") { selector = "delayS"; }
			else if (unit === "m") { selector = "delayM"; }
			else {
				throw "Invalid delay unit: '" + unit + "'";
			}
			stream.push(builder.primitiveCall(id, selector, [time]));
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
		elapsed_time: function (block, ctx) {
			let id = XML.getId(block);
			let unit = XML.getChildNode(block, "unit").innerText;
			let selector;
			if (unit === "ms") {
				selector = "millis";
			} else if (unit === "s") {
				selector = "seconds";
			} else if (unit === "m") {
				selector = "minutes";
			}
			stream.push(builder.primitiveCall(id, selector, []));
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
			let id = XML.getId(block);
			let type = XML.getChildNode(block, "property").innerText;
			let num = generateCodeForValue(block, ctx, "value");
			let args = [num];
			let selector;
			if (type === "even") {
				selector = "isEven";
			} else if (type === "odd") {
				selector = "isOdd";
			} else if (type === "prime") {
				selector = "isPrime";
			} else if (type === "whole") {
				selector = "isWhole";
			} else if (type === "positive") {
				selector = "isPositive";
			} else if (type === "negative") {
				selector = "isNegative";
			} else {
				throw "Math number property not found: '" + type + "'";
			}
			stream.push(builder.primitiveCall(id, selector, args));
		},
		number_divisibility: function (block, ctx) {
			let id = XML.getId(block);
			let left = generateCodeForValue(block, ctx, "left");
			let right = generateCodeForValue(block, ctx, "right");
			selector = "isDivisibleBy";
			let args = [left, right];
			stream.push(builder.primitiveCall(id, selector, args));
		},
		repeat_times: function (block, ctx) {
			let id = XML.getId(block);
			let times = generateCodeForValue(block, ctx, "times");
			let statements = [];
			generateCodeForStatements(block, ctx, "statements", statements);
			stream.push(builder.repeat(id, times, statements));
		},
		number_round: function (block, ctx) {
			let id = XML.getId(block);
			let type = XML.getChildNode(block, "operator").innerText;
			let num = generateCodeForValue(block, ctx, "number");
			let valid = ["round", "ceil", "floor"];
			if (!valid.includes(type)) {
				throw "Math round type not found: '" + type + "'";
			}
			let selector = type;
			stream.push(builder.primitiveCall(id, selector, [num]));
		},
		number_operation: function (block, ctx) {
			let id = XML.getId(block);
			let type = XML.getChildNode(block, "operator").innerText;
			let num = generateCodeForValue(block, ctx, "number");
			let selector;
			let args = [num];
			if (type === "sqrt") {
				selector = "sqrt";
			} else if (type === "abs") {
				selector = "abs";
			} else if (type === "negate") {
				selector = "*";
				args.push(builder.number(id, -1));
			} else if (type === "ln") {
				selector = "ln";
			} else if (type === "log10") {
				selector = "log10";
			} else if (type === "exp") {
				selector = "exp";
			} else if (type === "pow10") {
				selector = "pow10";
			} else {
				throw "Math function not found: '" + type + "'";
			}
			stream.push(builder.primitiveCall(id, selector, args));
		},
		number_trig: function (block, ctx) {
			let id = XML.getId(block);
			let type = XML.getChildNode(block, "operator").innerText;
			let num = generateCodeForValue(block, ctx, "number");
			let valid = ["sin", "cos", "tan", "asin", "acos", "atan"];
			if (!valid.includes(type)) {
				throw "Math trig function not found: '" + type + "'";
			}
			let selector = type;
			stream.push(builder.primitiveCall(id, selector, [num]));
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
		number_constrain: function (block, ctx) {
			let id = XML.getId(block);
			let value = generateCodeForValue(block, ctx, "value");
			let low = generateCodeForValue(block, ctx, "low");
			let high = generateCodeForValue(block, ctx, "high");
			stream.push(builder.primitiveCall(id, "constrain", [value, low, high]));
		},
		number_between: function (block, ctx) {
			let id = XML.getId(block);
			let args = [
				{name: "value", value: generateCodeForValue(block, ctx, "value")},
				{name: "min", value: generateCodeForValue(block, ctx, "low")},
				{name: "max", value: generateCodeForValue(block, ctx, "high")}];
			stream.push(builder.scriptCall(id, "isBetween", args));
		},
		number_random_int: function (block, ctx) {
			let id = XML.getId(block);
			let from = generateCodeForValue(block, ctx, "from");
			let to = generateCodeForValue(block, ctx, "to");
			stream.push(builder.primitiveCall(id, "randomInt", [from, to]));
		},
		number_random_float: function (block, ctx) {
			let id = XML.getId(block);
			stream.push(builder.primitiveCall(id, "random", []));
		},
		declare_local_variable: function (block, ctx) {
			let id = XML.getId(block);
			let name = asIdentifier(XML.getChildNode(block, "variableName").innerText);
			let value = generateCodeForValue(block, ctx, "value");

			stream.push(builder.variableDeclaration(id, name, value));
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
			})
			ctx.builder.appendLine("):");
			ctx.builder.incrementLevel(() => {
				generateCodeForStatements(block, ctx, "statements");
			});
			ctx.builder.newline();
		},
		proc_call_0args: function (block, ctx) {
			let id = XML.getId(block);
			let procName = asIdentifier(XML.getChildNode(block, "procName").innerText);
			stream.push(builder.scriptCall(id, procName, []));
		},
		proc_call_1args: function (block, ctx) {
			let id = XML.getId(block);
			let procName = asIdentifier(XML.getChildNode(block, "procName").innerText);
			let args = [{name: null, value: generateCodeForValue(block, ctx, "arg0")}];
			stream.push(builder.scriptCall(id, procName, args));
		},
		proc_call_2args: function (block, ctx) {
			let id = XML.getId(block);
			let procName = asIdentifier(XML.getChildNode(block, "procName").innerText);
			let args = [{name: null, value: generateCodeForValue(block, ctx, "arg0")},
									{name: null, value: generateCodeForValue(block, ctx, "arg1")}];
			stream.push(builder.scriptCall(id, procName, args));
		},
		proc_call_3args: function (block, ctx) {
			let id = XML.getId(block);
			let procName = asIdentifier(XML.getChildNode(block, "procName").innerText);
			let args = [{name: null, value: generateCodeForValue(block, ctx, "arg0")},
									{name: null, value: generateCodeForValue(block, ctx, "arg1")},
									{name: null, value: generateCodeForValue(block, ctx, "arg2")}];
			stream.push(builder.scriptCall(id, procName, args));
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
			let id = XML.getId(block);
			let funcName = asIdentifier(XML.getChildNode(block, "funcName").innerText);
			stream.push(builder.scriptCall(id, funcName, []));
		},
		func_call_1args: function (block, ctx) {
			let id = XML.getId(block);
			let funcName = asIdentifier(XML.getChildNode(block, "funcName").innerText);
			let args = [{name: null, value: generateCodeForValue(block, ctx, "arg0")}];
			stream.push(builder.scriptCall(id, funcName, args));
		},
		func_call_2args: function (block, ctx) {
			let id = XML.getId(block);
			let funcName = asIdentifier(XML.getChildNode(block, "funcName").innerText);
			let args = [{name: null, value: generateCodeForValue(block, ctx, "arg0")},
									{name: null, value: generateCodeForValue(block, ctx, "arg1")}];
			stream.push(builder.scriptCall(id, funcName, args));
		},
		func_call_3args: function (block, ctx) {
			let id = XML.getId(block);
			let funcName = asIdentifier(XML.getChildNode(block, "funcName").innerText);
			let args = [{name: null, value: generateCodeForValue(block, ctx, "arg0")},
									{name: null, value: generateCodeForValue(block, ctx, "arg1")},
									{name: null, value: generateCodeForValue(block, ctx, "arg2")}];
			stream.push(builder.scriptCall(id, funcName, args));
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
		generateCodeFor(XML.getLastChild(child), ctx);
	}

	function generateCodeForStatements(block, ctx, name) {
		let stmts = getStatements(block, name);
		if (stmts.length == 0) {
			ctx.builder.indent().appendLine("pass");
		} else {
			stmts.forEach(stmt => generateCodeFor(stmt, ctx));
		}
	}

	function getStatements(block, name) {
		let child = XML.getChildNode(block, name || "statements");
		let stmts = [];
		if (child !== undefined) {
			child.childNodes.forEach(function (each) {
				let next = each;
				do {
					try {
						stmts.push(next);
					} catch (err) {
						console.log(err);
					}
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

	return {
		generate: function (xml) {
			let builder = new Builder();
			builder.appendLines("from controller import Robot, DistanceSensor, Motor",
													"",
													"TIME_STEP = 64",
													"MAX_SPEED = 6.28",
													"",
													"robot = Robot()",
													"");
			let ctx = {
				builder: builder,
				path: [xml]
			};
			Array.from(xml.childNodes).filter(isTopLevel).forEach(function (block) {
				try {
					generateCodeFor(block, ctx);
				} catch (err) {
					//console.log(err);
					throw err;
				}
			});
			return builder.toString();
		}
	}
})();
