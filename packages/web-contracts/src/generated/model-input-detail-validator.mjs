var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// BrowserModelInputDetail-validator.cjs
var require_BrowserModelInputDetail_validator = __commonJS({
  "BrowserModelInputDetail-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema12 = { "type": "object", "properties": { "call": { "$ref": "#/definitions/BrowserModelInputRecordWire" }, "previousSystem": { "type": ["string", "null"] }, "previousCallId": { "type": ["string", "null"], "pattern": "\\S" }, "systemVersion": { "type": "string" } }, "required": ["call", "previousSystem", "previousCallId", "systemVersion"], "additionalProperties": false, "description": "\u5B8C\u6574\u6A21\u578B\u8F93\u5165\u8C03\u7528\u8BE6\u60C5\uFF08\u7528\u4E8E\u53EA\u8BFB\u6BD4\u5BF9\uFF09\u3002" };
    var schema13 = { "type": "object", "properties": { "goalId": { "type": "string", "pattern": "\\S" }, "runId": { "type": "string", "pattern": "\\S" }, "callId": { "type": "string", "pattern": "\\S" }, "executionUnitId": { "type": "string", "pattern": "\\S" }, "stepIndex": { "type": "integer", "maximum": 9007199254740991, "minimum": 1 }, "stage": { "type": "string", "enum": ["think", "decide", "completion_review"] }, "occurredAt": { "type": "string" }, "messages": { "type": "array", "items": { "$ref": "#/definitions/BrowserModelInputMessageWire" } } }, "required": ["goalId", "runId", "callId", "stepIndex", "stage", "occurredAt", "messages"], "additionalProperties": false, "description": "\u5B8C\u6574\u6A21\u578B\u8F93\u5165\u8C03\u7528\u7684 wire \u8BB0\u5F55\u3002" };
    var pattern0 = new RegExp("\\S", "u");
    var schema14 = { "type": "object", "properties": { "role": { "type": "string", "enum": ["system", "user", "assistant", "tool"] }, "content": { "type": "string" }, "source": { "type": "string", "enum": ["system", "conversation", "section", "working_context", "stage", "request", "native_history"] }, "reasoning": { "type": "string" }, "toolCalls": { "type": "array", "items": { "$ref": "#/definitions/BrowserModelInputToolCall" } }, "continuation": {}, "callId": { "type": "string", "pattern": "\\S" }, "toolId": { "type": "string", "pattern": "\\S" } }, "required": ["role", "content", "source"], "additionalProperties": false, "description": "\u6A21\u578B\u8F93\u5165\u6D88\u606F\u7684\u72EC\u7ACB wire \u4F20\u8F93\u7ED3\u6784\u3002" };
    function validate13(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.role === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.content === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "content" }, message: "must have required property 'content'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.source === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "source" }, message: "must have required property 'source'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "role" || key0 === "content" || key0 === "source" || key0 === "reasoning" || key0 === "toolCalls" || key0 === "continuation" || key0 === "callId" || key0 === "toolId")) {
            const err3 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.role !== void 0) {
          let data0 = data.role;
          if (typeof data0 !== "string") {
            const err4 = { instancePath: instancePath + "/role", schemaPath: "#/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
          if (!(data0 === "system" || data0 === "user" || data0 === "assistant" || data0 === "tool")) {
            const err5 = { instancePath: instancePath + "/role", schemaPath: "#/properties/role/enum", keyword: "enum", params: { allowedValues: schema14.properties.role.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.content !== void 0) {
          if (typeof data.content !== "string") {
            const err6 = { instancePath: instancePath + "/content", schemaPath: "#/properties/content/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data.source !== void 0) {
          let data2 = data.source;
          if (typeof data2 !== "string") {
            const err7 = { instancePath: instancePath + "/source", schemaPath: "#/properties/source/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
          if (!(data2 === "system" || data2 === "conversation" || data2 === "section" || data2 === "working_context" || data2 === "stage" || data2 === "request" || data2 === "native_history")) {
            const err8 = { instancePath: instancePath + "/source", schemaPath: "#/properties/source/enum", keyword: "enum", params: { allowedValues: schema14.properties.source.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data.reasoning !== void 0) {
          if (typeof data.reasoning !== "string") {
            const err9 = { instancePath: instancePath + "/reasoning", schemaPath: "#/properties/reasoning/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
        }
        if (data.toolCalls !== void 0) {
          let data4 = data.toolCalls;
          if (Array.isArray(data4)) {
            const len0 = data4.length;
            for (let i0 = 0; i0 < len0; i0++) {
              let data5 = data4[i0];
              if (data5 && typeof data5 == "object" && !Array.isArray(data5)) {
                if (data5.callId === void 0) {
                  const err10 = { instancePath: instancePath + "/toolCalls/" + i0, schemaPath: "#/definitions/BrowserModelInputToolCall/required", keyword: "required", params: { missingProperty: "callId" }, message: "must have required property 'callId'" };
                  if (vErrors === null) {
                    vErrors = [err10];
                  } else {
                    vErrors.push(err10);
                  }
                  errors++;
                }
                if (data5.toolId === void 0) {
                  const err11 = { instancePath: instancePath + "/toolCalls/" + i0, schemaPath: "#/definitions/BrowserModelInputToolCall/required", keyword: "required", params: { missingProperty: "toolId" }, message: "must have required property 'toolId'" };
                  if (vErrors === null) {
                    vErrors = [err11];
                  } else {
                    vErrors.push(err11);
                  }
                  errors++;
                }
                if (data5.argumentsJson === void 0) {
                  const err12 = { instancePath: instancePath + "/toolCalls/" + i0, schemaPath: "#/definitions/BrowserModelInputToolCall/required", keyword: "required", params: { missingProperty: "argumentsJson" }, message: "must have required property 'argumentsJson'" };
                  if (vErrors === null) {
                    vErrors = [err12];
                  } else {
                    vErrors.push(err12);
                  }
                  errors++;
                }
                for (const key1 in data5) {
                  if (!(key1 === "callId" || key1 === "toolId" || key1 === "argumentsJson")) {
                    const err13 = { instancePath: instancePath + "/toolCalls/" + i0, schemaPath: "#/definitions/BrowserModelInputToolCall/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err13];
                    } else {
                      vErrors.push(err13);
                    }
                    errors++;
                  }
                }
                if (data5.callId !== void 0) {
                  let data6 = data5.callId;
                  if (typeof data6 === "string") {
                    if (!pattern0.test(data6)) {
                      const err14 = { instancePath: instancePath + "/toolCalls/" + i0 + "/callId", schemaPath: "#/definitions/BrowserModelInputToolCall/properties/callId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err14];
                      } else {
                        vErrors.push(err14);
                      }
                      errors++;
                    }
                  } else {
                    const err15 = { instancePath: instancePath + "/toolCalls/" + i0 + "/callId", schemaPath: "#/definitions/BrowserModelInputToolCall/properties/callId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err15];
                    } else {
                      vErrors.push(err15);
                    }
                    errors++;
                  }
                }
                if (data5.toolId !== void 0) {
                  let data7 = data5.toolId;
                  if (typeof data7 === "string") {
                    if (!pattern0.test(data7)) {
                      const err16 = { instancePath: instancePath + "/toolCalls/" + i0 + "/toolId", schemaPath: "#/definitions/BrowserModelInputToolCall/properties/toolId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err16];
                      } else {
                        vErrors.push(err16);
                      }
                      errors++;
                    }
                  } else {
                    const err17 = { instancePath: instancePath + "/toolCalls/" + i0 + "/toolId", schemaPath: "#/definitions/BrowserModelInputToolCall/properties/toolId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err17];
                    } else {
                      vErrors.push(err17);
                    }
                    errors++;
                  }
                }
                if (data5.argumentsJson !== void 0) {
                  if (typeof data5.argumentsJson !== "string") {
                    const err18 = { instancePath: instancePath + "/toolCalls/" + i0 + "/argumentsJson", schemaPath: "#/definitions/BrowserModelInputToolCall/properties/argumentsJson/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err18];
                    } else {
                      vErrors.push(err18);
                    }
                    errors++;
                  }
                }
              } else {
                const err19 = { instancePath: instancePath + "/toolCalls/" + i0, schemaPath: "#/definitions/BrowserModelInputToolCall/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err19];
                } else {
                  vErrors.push(err19);
                }
                errors++;
              }
            }
          } else {
            const err20 = { instancePath: instancePath + "/toolCalls", schemaPath: "#/properties/toolCalls/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err20];
            } else {
              vErrors.push(err20);
            }
            errors++;
          }
        }
        if (data.callId !== void 0) {
          let data9 = data.callId;
          if (typeof data9 === "string") {
            if (!pattern0.test(data9)) {
              const err21 = { instancePath: instancePath + "/callId", schemaPath: "#/properties/callId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err21];
              } else {
                vErrors.push(err21);
              }
              errors++;
            }
          } else {
            const err22 = { instancePath: instancePath + "/callId", schemaPath: "#/properties/callId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err22];
            } else {
              vErrors.push(err22);
            }
            errors++;
          }
        }
        if (data.toolId !== void 0) {
          let data10 = data.toolId;
          if (typeof data10 === "string") {
            if (!pattern0.test(data10)) {
              const err23 = { instancePath: instancePath + "/toolId", schemaPath: "#/properties/toolId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err23];
              } else {
                vErrors.push(err23);
              }
              errors++;
            }
          } else {
            const err24 = { instancePath: instancePath + "/toolId", schemaPath: "#/properties/toolId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err24];
            } else {
              vErrors.push(err24);
            }
            errors++;
          }
        }
      } else {
        const err25 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err25];
        } else {
          vErrors.push(err25);
        }
        errors++;
      }
      validate13.errors = vErrors;
      return errors === 0;
    }
    function validate12(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.goalId === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.runId === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.callId === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "callId" }, message: "must have required property 'callId'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.stepIndex === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "stepIndex" }, message: "must have required property 'stepIndex'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.stage === void 0) {
          const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "stage" }, message: "must have required property 'stage'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        if (data.occurredAt === void 0) {
          const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "occurredAt" }, message: "must have required property 'occurredAt'" };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        if (data.messages === void 0) {
          const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "messages" }, message: "must have required property 'messages'" };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "goalId" || key0 === "runId" || key0 === "callId" || key0 === "executionUnitId" || key0 === "stepIndex" || key0 === "stage" || key0 === "occurredAt" || key0 === "messages")) {
            const err7 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
        if (data.goalId !== void 0) {
          let data0 = data.goalId;
          if (typeof data0 === "string") {
            if (!pattern0.test(data0)) {
              const err8 = { instancePath: instancePath + "/goalId", schemaPath: "#/properties/goalId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err8];
              } else {
                vErrors.push(err8);
              }
              errors++;
            }
          } else {
            const err9 = { instancePath: instancePath + "/goalId", schemaPath: "#/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
        }
        if (data.runId !== void 0) {
          let data1 = data.runId;
          if (typeof data1 === "string") {
            if (!pattern0.test(data1)) {
              const err10 = { instancePath: instancePath + "/runId", schemaPath: "#/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
          } else {
            const err11 = { instancePath: instancePath + "/runId", schemaPath: "#/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
        }
        if (data.callId !== void 0) {
          let data2 = data.callId;
          if (typeof data2 === "string") {
            if (!pattern0.test(data2)) {
              const err12 = { instancePath: instancePath + "/callId", schemaPath: "#/properties/callId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
          } else {
            const err13 = { instancePath: instancePath + "/callId", schemaPath: "#/properties/callId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
        }
        if (data.executionUnitId !== void 0) {
          let data3 = data.executionUnitId;
          if (typeof data3 === "string") {
            if (!pattern0.test(data3)) {
              const err14 = { instancePath: instancePath + "/executionUnitId", schemaPath: "#/properties/executionUnitId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err14];
              } else {
                vErrors.push(err14);
              }
              errors++;
            }
          } else {
            const err15 = { instancePath: instancePath + "/executionUnitId", schemaPath: "#/properties/executionUnitId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
        }
        if (data.stepIndex !== void 0) {
          let data4 = data.stepIndex;
          if (!(typeof data4 == "number" && (!(data4 % 1) && !isNaN(data4)) && isFinite(data4))) {
            const err16 = { instancePath: instancePath + "/stepIndex", schemaPath: "#/properties/stepIndex/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err16];
            } else {
              vErrors.push(err16);
            }
            errors++;
          }
          if (typeof data4 == "number" && isFinite(data4)) {
            if (data4 > 9007199254740991 || isNaN(data4)) {
              const err17 = { instancePath: instancePath + "/stepIndex", schemaPath: "#/properties/stepIndex/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err17];
              } else {
                vErrors.push(err17);
              }
              errors++;
            }
            if (data4 < 1 || isNaN(data4)) {
              const err18 = { instancePath: instancePath + "/stepIndex", schemaPath: "#/properties/stepIndex/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
          }
        }
        if (data.stage !== void 0) {
          let data5 = data.stage;
          if (typeof data5 !== "string") {
            const err19 = { instancePath: instancePath + "/stage", schemaPath: "#/properties/stage/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err19];
            } else {
              vErrors.push(err19);
            }
            errors++;
          }
          if (!(data5 === "think" || data5 === "decide" || data5 === "completion_review")) {
            const err20 = { instancePath: instancePath + "/stage", schemaPath: "#/properties/stage/enum", keyword: "enum", params: { allowedValues: schema13.properties.stage.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err20];
            } else {
              vErrors.push(err20);
            }
            errors++;
          }
        }
        if (data.occurredAt !== void 0) {
          if (typeof data.occurredAt !== "string") {
            const err21 = { instancePath: instancePath + "/occurredAt", schemaPath: "#/properties/occurredAt/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err21];
            } else {
              vErrors.push(err21);
            }
            errors++;
          }
        }
        if (data.messages !== void 0) {
          let data7 = data.messages;
          if (Array.isArray(data7)) {
            const len0 = data7.length;
            for (let i0 = 0; i0 < len0; i0++) {
              if (!validate13(data7[i0], { instancePath: instancePath + "/messages/" + i0, parentData: data7, parentDataProperty: i0, rootData })) {
                vErrors = vErrors === null ? validate13.errors : vErrors.concat(validate13.errors);
                errors = vErrors.length;
              }
            }
          } else {
            const err22 = { instancePath: instancePath + "/messages", schemaPath: "#/properties/messages/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err22];
            } else {
              vErrors.push(err22);
            }
            errors++;
          }
        }
      } else {
        const err23 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err23];
        } else {
          vErrors.push(err23);
        }
        errors++;
      }
      validate12.errors = vErrors;
      return errors === 0;
    }
    function validate11(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.call === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "call" }, message: "must have required property 'call'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.previousSystem === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "previousSystem" }, message: "must have required property 'previousSystem'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.previousCallId === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "previousCallId" }, message: "must have required property 'previousCallId'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.systemVersion === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "systemVersion" }, message: "must have required property 'systemVersion'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "call" || key0 === "previousSystem" || key0 === "previousCallId" || key0 === "systemVersion")) {
            const err4 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.call !== void 0) {
          if (!validate12(data.call, { instancePath: instancePath + "/call", parentData: data, parentDataProperty: "call", rootData })) {
            vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
            errors = vErrors.length;
          }
        }
        if (data.previousSystem !== void 0) {
          let data1 = data.previousSystem;
          if (typeof data1 !== "string" && data1 !== null) {
            const err5 = { instancePath: instancePath + "/previousSystem", schemaPath: "#/properties/previousSystem/type", keyword: "type", params: { type: schema12.properties.previousSystem.type }, message: "must be string,null" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.previousCallId !== void 0) {
          let data2 = data.previousCallId;
          if (typeof data2 !== "string" && data2 !== null) {
            const err6 = { instancePath: instancePath + "/previousCallId", schemaPath: "#/properties/previousCallId/type", keyword: "type", params: { type: schema12.properties.previousCallId.type }, message: "must be string,null" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
          if (typeof data2 === "string") {
            if (!pattern0.test(data2)) {
              const err7 = { instancePath: instancePath + "/previousCallId", schemaPath: "#/properties/previousCallId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
          }
        }
        if (data.systemVersion !== void 0) {
          if (typeof data.systemVersion !== "string") {
            const err8 = { instancePath: instancePath + "/systemVersion", schemaPath: "#/properties/systemVersion/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
      } else {
        const err9 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
      validate11.errors = vErrors;
      return errors === 0;
    }
    function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      ;
      let vErrors = null;
      let errors = 0;
      if (!validate11(data, { instancePath, parentData, parentDataProperty, rootData })) {
        vErrors = vErrors === null ? validate11.errors : vErrors.concat(validate11.errors);
        errors = vErrors.length;
      }
      validate10.errors = vErrors;
      return errors === 0;
    }
  }
});
export default require_BrowserModelInputDetail_validator();
