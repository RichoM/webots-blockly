
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
	toString() {
		return this.content.join("");
	}
}

let BlocksToPy = (function () {
	let topLevelBlocks = ["simulator_loop",
												"proc_definition_0args", "proc_definition_1args",
												"proc_definition_2args", "proc_definition_3args",
												"func_definition_0args", "func_definition_1args",
												"func_definition_2args", "func_definition_3args"];
	let dispatchTable =  {
		simulator_loop: function (block, ctx) {
			let id = XML.getId(block);
			ctx.builder.appendLine("while ACAACA:")
				.incrementLevel(() => {
					generateCodeForStatements(block, ctx, "statements");
				});
		},
		forever: function (block, ctx) {
			let id = XML.getId(block);
			let statements = [];
			generateCodeForStatements(block, ctx, "statements", statements);
			stream.push(builder.forever(id, statements));
		},
		for: function (block, ctx) {
			let id = XML.getId(block);
			let variableName = asIdentifier(XML.getChildNode(block, "variableName").innerText);
			let start = generateCodeForValue(block, ctx, "start");
			let stop = generateCodeForValue(block, ctx, "stop");
			let step = generateCodeForValue(block, ctx, "step");
			let statements = [];
			generateCodeForStatements(block, ctx, "statements", statements);
			stream.push(builder.for(id, variableName, start, stop, step, statements));
		},
		number: function (block, ctx) {
			let id = XML.getId(block);
			let value = parseFloat(XML.getChildNode(block, "value").innerText);
			stream.push(builder.number(id, value));
		},
		variable: function (block, ctx) {
			let id = XML.getId(block);
			let variableName = asIdentifier(XML.getChildNode(block, "variableName").innerText);
			if (!ctx.isLocalDefined(variableName)) {
				ctx.addGlobal(variableName);
			}
			stream.push(builder.variable(id, variableName));
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
			let id = XML.getId(block);
			let condition = generateCodeForValue(block, ctx, "condition");
			let trueBranch = [];
			generateCodeForStatements(block, ctx, "trueBranch", trueBranch);
			stream.push(builder.conditional(id, condition, trueBranch, []));
		},
		conditional_full: function (block, ctx) {
			let id = XML.getId(block);
			let condition = generateCodeForValue(block, ctx, "condition");
			let trueBranch = [];
			generateCodeForStatements(block, ctx, "trueBranch", trueBranch);
			let falseBranch = [];
			generateCodeForStatements(block, ctx, "falseBranch", falseBranch);
			stream.push(builder.conditional(id, condition, trueBranch, falseBranch));
		},
		logical_compare: function (block, ctx) {
			let id = XML.getId(block);
			let type = XML.getChildNode(block, "operator").innerText;
			let left = generateCodeForValue(block, ctx, "left");
			let right = generateCodeForValue(block, ctx, "right");
			let valid = ["==", "!=", "<", "<=", ">", ">="];
			if (!valid.includes(type)) {
				throw "Logical operator not found: '" + type + "'";
			}
			let selector = type;
			stream.push(builder.primitiveCall(id, selector, [left, right]));
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
			let id = XML.getId(block);
			let type = XML.getChildNode(block, "operator").innerText;
			let left = generateCodeForValue(block, ctx, "left");
			let right = generateCodeForValue(block, ctx, "right");
			if (type === "and") {
				stream.push(builder.logicalAnd(id, left, right));
			} else if (type === "or") {
				stream.push(builder.logicalOr(id, left, right));
			}
		},
		boolean: function (block, ctx) {
			let id = XML.getId(block);
			let bool = XML.getChildNode(block, "value").innerText;
			stream.push(builder.number(id, bool === "true" ? 1 : 0));
		},
		logical_not: function (block, ctx) {
			let id = XML.getId(block);
			let bool = generateCodeForValue(block, ctx, "value");
			stream.push(builder.primitiveCall(id, "!", [bool]));
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
				// HACK(Richo): Special case because JSON encodes Infinity as null
				value = {___INF___: 1};
			} else {
				throw "Math constant not found: '" + type + "'";
			}
			stream.push(builder.number(id, value));
		},
		math_arithmetic: function (block, ctx) {
			let id = XML.getId(block);
			let type = XML.getChildNode(block, "operator").innerText;
			let left = generateCodeForValue(block, ctx, "left");
			let right = generateCodeForValue(block, ctx, "right");
			let selector;
			if (type === "DIVIDE") {
				selector = "/";
			} else if (type === "MULTIPLY") {
				selector = "*";
			} else if (type === "MINUS") {
				selector = "-";
			} else if (type === "ADD") {
				selector = "+";
			} else if (type === "POWER") {
				selector = "**";
			} else {
				throw "Math arithmetic function not found: '" + type + "'";
			}
			stream.push(builder.primitiveCall(id, selector, [left, right]));
		},
		repeat: function (block, ctx) {
			let id = XML.getId(block);
			let negated = XML.getChildNode(block, "negate").innerText === "true";
			let condition = generateCodeForValue(block, ctx, "condition");
			let statements = [];
			generateCodeForStatements(block, ctx, "statements", statements);
			if (negated) {
				stream.push(builder.until(id, condition, statements));
			} else {
				stream.push(builder.while(id, condition, statements));
			}
		},
		is_pin_variable: function (block, ctx) {
			let id = XML.getId(block);
			let pinState = XML.getChildNode(block, "pinState").innerText;
			let pinNumber = generateCodeForValue(block, ctx, "pinNumber");
			let selector = pinState === "on" ? "isOn" : "isOff";
			stream.push(builder.primitiveCall(id, selector, [pinNumber]));
		},
		wait: function (block, ctx) {
			let id = XML.getId(block);
			let negated = XML.getChildNode(block, "negate").innerText === "true";
			let condition = generateCodeForValue(block, ctx, "condition");
			if (negated) {
				stream.push(builder.until(id, condition, []));
			} else {
				stream.push(builder.while(id, condition, []));
			}
		},
		number_modulo: function (block, ctx) {
			let id = XML.getId(block);
			let left = generateCodeForValue(block, ctx, "dividend");
			let right = generateCodeForValue(block, ctx, "divisor");
			stream.push(builder.primitiveCall(id, "%", [left, right]));
		},
		set_variable: function (block, ctx) {
			let id = XML.getId(block);
			let name = asIdentifier(XML.getChildNode(block, "variableName").innerText);
			if (!ctx.isLocalDefined(name)) {
				ctx.addGlobal(name);
			}
			let value = generateCodeForValue(block, ctx, "value");
			if (value == undefined) {
				value = builder.number(id, 0);
			}
			stream.push(builder.assignment(id, name, value));
		},
		increment_variable: function (block, ctx) {
			let id = XML.getId(block);
			let name = asIdentifier(XML.getChildNode(block, "variableName").innerText);
			if (!ctx.isLocalDefined(name)) {
				ctx.addGlobal(name);
			}
			let delta = generateCodeForValue(block, ctx, "value");
			let variable = builder.variable(id, name);
			stream.push(builder.assignment(id, name,
				builder.primitiveCall(id, "+", [variable, delta])));
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
			let id = XML.getId(block);
			let name = asIdentifier(XML.getChildNode(block, "procName").innerText);
			let statements = [];
			generateCodeForStatements(block, ctx, "statements", statements);
			let args = [];
			stream.push(builder.procedure(id, name, args, statements));
		},
		proc_definition_1args: function (block, ctx) {
			let id = XML.getId(block);
			let name = asIdentifier(XML.getChildNode(block, "procName").innerText);
			let statements = [];
			generateCodeForStatements(block, ctx, "statements", statements);
			let args = [asIdentifier(XML.getChildNode(block, "arg0").innerText)];
			stream.push(builder.procedure(id, name, args, statements));
		},
		proc_definition_2args: function (block, ctx) {
			let id = XML.getId(block);
			let name = asIdentifier(XML.getChildNode(block, "procName").innerText);
			let statements = [];
			generateCodeForStatements(block, ctx, "statements", statements);
			let args = [asIdentifier(XML.getChildNode(block, "arg0").innerText),
									asIdentifier(XML.getChildNode(block, "arg1").innerText)];
			stream.push(builder.procedure(id, name, args, statements));
		},
		proc_definition_3args: function (block, ctx) {
			let id = XML.getId(block);
			let name = asIdentifier(XML.getChildNode(block, "procName").innerText);
			let statements = [];
			generateCodeForStatements(block, ctx, "statements", statements);
			let args = [asIdentifier(XML.getChildNode(block, "arg0").innerText),
									asIdentifier(XML.getChildNode(block, "arg1").innerText),
									asIdentifier(XML.getChildNode(block, "arg2").innerText)];
			stream.push(builder.procedure(id, name, args, statements));
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
			let id = XML.getId(block);
			let name = asIdentifier(XML.getChildNode(block, "funcName").innerText);
			let statements = [];
			generateCodeForStatements(block, ctx, "statements", statements);
			let args = [];
			stream.push(builder.function(id, name, args, statements));
		},
		func_definition_1args: function (block, ctx) {
			let id = XML.getId(block);
			let name = asIdentifier(XML.getChildNode(block, "funcName").innerText);
			let statements = [];
			generateCodeForStatements(block, ctx, "statements", statements);
			let args = [asIdentifier(XML.getChildNode(block, "arg0").innerText)];
			stream.push(builder.function(id, name, args, statements));
		},
		func_definition_2args: function (block, ctx) {
			let id = XML.getId(block);
			let name = asIdentifier(XML.getChildNode(block, "funcName").innerText);
			let statements = [];
			generateCodeForStatements(block, ctx, "statements", statements);
			let args = [asIdentifier(XML.getChildNode(block, "arg0").innerText),
									asIdentifier(XML.getChildNode(block, "arg1").innerText)];
			stream.push(builder.function(id, name, args, statements));
		},
		func_definition_3args: function (block, ctx) {
			let id = XML.getId(block);
			let name = asIdentifier(XML.getChildNode(block, "funcName").innerText);
			let statements = [];
			generateCodeForStatements(block, ctx, "statements", statements);
			let args = [asIdentifier(XML.getChildNode(block, "arg0").innerText),
									asIdentifier(XML.getChildNode(block, "arg1").innerText),
									asIdentifier(XML.getChildNode(block, "arg2").innerText)];
			stream.push(builder.function(id, name, args, statements));
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
			let id = XML.getId(block);
			stream.push(builder.return(id, null));
		},
		return_value: function (block, ctx) {
			let id = XML.getId(block);
			stream.push(builder.return(id, generateCodeForValue(block, ctx, "value")));
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
		let stream = [];
		generateCodeFor(XML.getLastChild(child), ctx);
		if (stream.length != 1) {
			throw "CODEGEN ERROR: Value block didn't generate single code element";
		}
		return stream[0];
	}

	function generateCodeForStatements(block, ctx, name) {
		let child = XML.getChildNode(block, name || "statements");
		if (child !== undefined) {
			child.childNodes.forEach(function (each) {
				let next = each;
				do {
					try {
						generateCodeFor(next, ctx);
					} catch (err) {
						console.log(err);
					}
					next = getNextStatement(next);
				} while (next !== undefined);
			});
		}
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
