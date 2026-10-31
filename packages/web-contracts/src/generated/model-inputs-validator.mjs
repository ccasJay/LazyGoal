var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// BrowserModelInputs-validator.cjs
var require_BrowserModelInputs_validator = __commonJS({
  "BrowserModelInputs-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema12 = { "type": "object", "properties": { "calls": { "type": "array", "items": { "$ref": "#/definitions/BrowserModelInputSummary" } }, "total": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "nextOffset": { "type": ["number", "null"], "maximum": 9007199254740991, "minimum": 0 } }, "required": ["calls", "total", "nextOffset"], "additionalProperties": false, "description": "\u6A21\u578B\u8F93\u5165\u5217\u8868\u54CD\u5E94\u3002" };
    var schema13 = { "type": "object", "properties": { "goalId": { "type": "string", "pattern": "\\S" }, "runId": { "type": "string", "pattern": "\\S" }, "callId": { "type": "string", "pattern": "\\S" }, "executionUnitId": { "type": "string", "pattern": "\\S" }, "stepIndex": { "type": "integer", "maximum": 9007199254740991, "minimum": 1 }, "stage": { "type": "string", "enum": ["think", "decide", "completion_review"] }, "occurredAt": { "type": "string" }, "systemVersion": { "type": "string" }, "systemChanged": { "type": "boolean" }, "firstSystem": { "type": "boolean" }, "previousCallId": { "type": ["string", "null"], "pattern": "\\S" }, "messages": { "type": "array", "items": { "$ref": "#/definitions/BrowserModelInputPreviewMessage" } }, "omittedMessageCount": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 } }, "required": ["goalId", "runId", "callId", "stepIndex", "stage", "occurredAt", "systemVersion", "systemChanged", "firstSystem", "previousCallId", "messages", "omittedMessageCount"], "additionalProperties": false, "description": "\u6A21\u578B\u8F93\u5165\u6458\u8981\u4F20\u8F93\u5BF9\u8C61\uFF08\u7528\u4E8E\u8C03\u7528\u5217\u8868\u5C55\u793A\uFF09\u3002" };
    var schema14 = { "type": "object", "properties": { "role": { "type": "string", "enum": ["system", "user", "assistant", "tool"] }, "source": { "type": "string", "enum": ["system", "conversation", "section", "working_context", "stage", "request", "native_history"] }, "index": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "preview": { "type": "string" }, "truncated": { "type": "boolean" } }, "required": ["role", "source", "index", "preview", "truncated"], "additionalProperties": false, "description": "\u6A21\u578B\u8F93\u5165\u9884\u89C8\u6D88\u606F\u3002" };
    var func2 = Object.prototype.hasOwnProperty;
    var pattern0 = new RegExp("\\S", "u");
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
        if (data.systemVersion === void 0) {
          const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "systemVersion" }, message: "must have required property 'systemVersion'" };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
        if (data.systemChanged === void 0) {
          const err7 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "systemChanged" }, message: "must have required property 'systemChanged'" };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
        if (data.firstSystem === void 0) {
          const err8 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "firstSystem" }, message: "must have required property 'firstSystem'" };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
        if (data.previousCallId === void 0) {
          const err9 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "previousCallId" }, message: "must have required property 'previousCallId'" };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
        if (data.messages === void 0) {
          const err10 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "messages" }, message: "must have required property 'messages'" };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
        if (data.omittedMessageCount === void 0) {
          const err11 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "omittedMessageCount" }, message: "must have required property 'omittedMessageCount'" };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!func2.call(schema13.properties, key0)) {
            const err12 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
        }
        if (data.goalId !== void 0) {
          let data0 = data.goalId;
          if (typeof data0 === "string") {
            if (!pattern0.test(data0)) {
              const err13 = { instancePath: instancePath + "/goalId", schemaPath: "#/properties/goalId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
          } else {
            const err14 = { instancePath: instancePath + "/goalId", schemaPath: "#/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
        }
        if (data.runId !== void 0) {
          let data1 = data.runId;
          if (typeof data1 === "string") {
            if (!pattern0.test(data1)) {
              const err15 = { instancePath: instancePath + "/runId", schemaPath: "#/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            }
          } else {
            const err16 = { instancePath: instancePath + "/runId", schemaPath: "#/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err16];
            } else {
              vErrors.push(err16);
            }
            errors++;
          }
        }
        if (data.callId !== void 0) {
          let data2 = data.callId;
          if (typeof data2 === "string") {
            if (!pattern0.test(data2)) {
              const err17 = { instancePath: instancePath + "/callId", schemaPath: "#/properties/callId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err17];
              } else {
                vErrors.push(err17);
              }
              errors++;
            }
          } else {
            const err18 = { instancePath: instancePath + "/callId", schemaPath: "#/properties/callId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err18];
            } else {
              vErrors.push(err18);
            }
            errors++;
          }
        }
        if (data.executionUnitId !== void 0) {
          let data3 = data.executionUnitId;
          if (typeof data3 === "string") {
            if (!pattern0.test(data3)) {
              const err19 = { instancePath: instancePath + "/executionUnitId", schemaPath: "#/properties/executionUnitId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err19];
              } else {
                vErrors.push(err19);
              }
              errors++;
            }
          } else {
            const err20 = { instancePath: instancePath + "/executionUnitId", schemaPath: "#/properties/executionUnitId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err20];
            } else {
              vErrors.push(err20);
            }
            errors++;
          }
        }
        if (data.stepIndex !== void 0) {
          let data4 = data.stepIndex;
          if (!(typeof data4 == "number" && (!(data4 % 1) && !isNaN(data4)) && isFinite(data4))) {
            const err21 = { instancePath: instancePath + "/stepIndex", schemaPath: "#/properties/stepIndex/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err21];
            } else {
              vErrors.push(err21);
            }
            errors++;
          }
          if (typeof data4 == "number" && isFinite(data4)) {
            if (data4 > 9007199254740991 || isNaN(data4)) {
              const err22 = { instancePath: instancePath + "/stepIndex", schemaPath: "#/properties/stepIndex/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err22];
              } else {
                vErrors.push(err22);
              }
              errors++;
            }
            if (data4 < 1 || isNaN(data4)) {
              const err23 = { instancePath: instancePath + "/stepIndex", schemaPath: "#/properties/stepIndex/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
              if (vErrors === null) {
                vErrors = [err23];
              } else {
                vErrors.push(err23);
              }
              errors++;
            }
          }
        }
        if (data.stage !== void 0) {
          let data5 = data.stage;
          if (typeof data5 !== "string") {
            const err24 = { instancePath: instancePath + "/stage", schemaPath: "#/properties/stage/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err24];
            } else {
              vErrors.push(err24);
            }
            errors++;
          }
          if (!(data5 === "think" || data5 === "decide" || data5 === "completion_review")) {
            const err25 = { instancePath: instancePath + "/stage", schemaPath: "#/properties/stage/enum", keyword: "enum", params: { allowedValues: schema13.properties.stage.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err25];
            } else {
              vErrors.push(err25);
            }
            errors++;
          }
        }
        if (data.occurredAt !== void 0) {
          if (typeof data.occurredAt !== "string") {
            const err26 = { instancePath: instancePath + "/occurredAt", schemaPath: "#/properties/occurredAt/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err26];
            } else {
              vErrors.push(err26);
            }
            errors++;
          }
        }
        if (data.systemVersion !== void 0) {
          if (typeof data.systemVersion !== "string") {
            const err27 = { instancePath: instancePath + "/systemVersion", schemaPath: "#/properties/systemVersion/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err27];
            } else {
              vErrors.push(err27);
            }
            errors++;
          }
        }
        if (data.systemChanged !== void 0) {
          if (typeof data.systemChanged !== "boolean") {
            const err28 = { instancePath: instancePath + "/systemChanged", schemaPath: "#/properties/systemChanged/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err28];
            } else {
              vErrors.push(err28);
            }
            errors++;
          }
        }
        if (data.firstSystem !== void 0) {
          if (typeof data.firstSystem !== "boolean") {
            const err29 = { instancePath: instancePath + "/firstSystem", schemaPath: "#/properties/firstSystem/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err29];
            } else {
              vErrors.push(err29);
            }
            errors++;
          }
        }
        if (data.previousCallId !== void 0) {
          let data10 = data.previousCallId;
          if (typeof data10 !== "string" && data10 !== null) {
            const err30 = { instancePath: instancePath + "/previousCallId", schemaPath: "#/properties/previousCallId/type", keyword: "type", params: { type: schema13.properties.previousCallId.type }, message: "must be string,null" };
            if (vErrors === null) {
              vErrors = [err30];
            } else {
              vErrors.push(err30);
            }
            errors++;
          }
          if (typeof data10 === "string") {
            if (!pattern0.test(data10)) {
              const err31 = { instancePath: instancePath + "/previousCallId", schemaPath: "#/properties/previousCallId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err31];
              } else {
                vErrors.push(err31);
              }
              errors++;
            }
          }
        }
        if (data.messages !== void 0) {
          let data11 = data.messages;
          if (Array.isArray(data11)) {
            const len0 = data11.length;
            for (let i0 = 0; i0 < len0; i0++) {
              let data12 = data11[i0];
              if (data12 && typeof data12 == "object" && !Array.isArray(data12)) {
                if (data12.role === void 0) {
                  const err32 = { instancePath: instancePath + "/messages/" + i0, schemaPath: "#/definitions/BrowserModelInputPreviewMessage/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
                  if (vErrors === null) {
                    vErrors = [err32];
                  } else {
                    vErrors.push(err32);
                  }
                  errors++;
                }
                if (data12.source === void 0) {
                  const err33 = { instancePath: instancePath + "/messages/" + i0, schemaPath: "#/definitions/BrowserModelInputPreviewMessage/required", keyword: "required", params: { missingProperty: "source" }, message: "must have required property 'source'" };
                  if (vErrors === null) {
                    vErrors = [err33];
                  } else {
                    vErrors.push(err33);
                  }
                  errors++;
                }
                if (data12.index === void 0) {
                  const err34 = { instancePath: instancePath + "/messages/" + i0, schemaPath: "#/definitions/BrowserModelInputPreviewMessage/required", keyword: "required", params: { missingProperty: "index" }, message: "must have required property 'index'" };
                  if (vErrors === null) {
                    vErrors = [err34];
                  } else {
                    vErrors.push(err34);
                  }
                  errors++;
                }
                if (data12.preview === void 0) {
                  const err35 = { instancePath: instancePath + "/messages/" + i0, schemaPath: "#/definitions/BrowserModelInputPreviewMessage/required", keyword: "required", params: { missingProperty: "preview" }, message: "must have required property 'preview'" };
                  if (vErrors === null) {
                    vErrors = [err35];
                  } else {
                    vErrors.push(err35);
                  }
                  errors++;
                }
                if (data12.truncated === void 0) {
                  const err36 = { instancePath: instancePath + "/messages/" + i0, schemaPath: "#/definitions/BrowserModelInputPreviewMessage/required", keyword: "required", params: { missingProperty: "truncated" }, message: "must have required property 'truncated'" };
                  if (vErrors === null) {
                    vErrors = [err36];
                  } else {
                    vErrors.push(err36);
                  }
                  errors++;
                }
                for (const key1 in data12) {
                  if (!(key1 === "role" || key1 === "source" || key1 === "index" || key1 === "preview" || key1 === "truncated")) {
                    const err37 = { instancePath: instancePath + "/messages/" + i0, schemaPath: "#/definitions/BrowserModelInputPreviewMessage/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err37];
                    } else {
                      vErrors.push(err37);
                    }
                    errors++;
                  }
                }
                if (data12.role !== void 0) {
                  let data13 = data12.role;
                  if (typeof data13 !== "string") {
                    const err38 = { instancePath: instancePath + "/messages/" + i0 + "/role", schemaPath: "#/definitions/BrowserModelInputPreviewMessage/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err38];
                    } else {
                      vErrors.push(err38);
                    }
                    errors++;
                  }
                  if (!(data13 === "system" || data13 === "user" || data13 === "assistant" || data13 === "tool")) {
                    const err39 = { instancePath: instancePath + "/messages/" + i0 + "/role", schemaPath: "#/definitions/BrowserModelInputPreviewMessage/properties/role/enum", keyword: "enum", params: { allowedValues: schema14.properties.role.enum }, message: "must be equal to one of the allowed values" };
                    if (vErrors === null) {
                      vErrors = [err39];
                    } else {
                      vErrors.push(err39);
                    }
                    errors++;
                  }
                }
                if (data12.source !== void 0) {
                  let data14 = data12.source;
                  if (typeof data14 !== "string") {
                    const err40 = { instancePath: instancePath + "/messages/" + i0 + "/source", schemaPath: "#/definitions/BrowserModelInputPreviewMessage/properties/source/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err40];
                    } else {
                      vErrors.push(err40);
                    }
                    errors++;
                  }
                  if (!(data14 === "system" || data14 === "conversation" || data14 === "section" || data14 === "working_context" || data14 === "stage" || data14 === "request" || data14 === "native_history")) {
                    const err41 = { instancePath: instancePath + "/messages/" + i0 + "/source", schemaPath: "#/definitions/BrowserModelInputPreviewMessage/properties/source/enum", keyword: "enum", params: { allowedValues: schema14.properties.source.enum }, message: "must be equal to one of the allowed values" };
                    if (vErrors === null) {
                      vErrors = [err41];
                    } else {
                      vErrors.push(err41);
                    }
                    errors++;
                  }
                }
                if (data12.index !== void 0) {
                  let data15 = data12.index;
                  if (!(typeof data15 == "number" && (!(data15 % 1) && !isNaN(data15)) && isFinite(data15))) {
                    const err42 = { instancePath: instancePath + "/messages/" + i0 + "/index", schemaPath: "#/definitions/BrowserModelInputPreviewMessage/properties/index/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                    if (vErrors === null) {
                      vErrors = [err42];
                    } else {
                      vErrors.push(err42);
                    }
                    errors++;
                  }
                  if (typeof data15 == "number" && isFinite(data15)) {
                    if (data15 > 9007199254740991 || isNaN(data15)) {
                      const err43 = { instancePath: instancePath + "/messages/" + i0 + "/index", schemaPath: "#/definitions/BrowserModelInputPreviewMessage/properties/index/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                      if (vErrors === null) {
                        vErrors = [err43];
                      } else {
                        vErrors.push(err43);
                      }
                      errors++;
                    }
                    if (data15 < 0 || isNaN(data15)) {
                      const err44 = { instancePath: instancePath + "/messages/" + i0 + "/index", schemaPath: "#/definitions/BrowserModelInputPreviewMessage/properties/index/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                      if (vErrors === null) {
                        vErrors = [err44];
                      } else {
                        vErrors.push(err44);
                      }
                      errors++;
                    }
                  }
                }
                if (data12.preview !== void 0) {
                  if (typeof data12.preview !== "string") {
                    const err45 = { instancePath: instancePath + "/messages/" + i0 + "/preview", schemaPath: "#/definitions/BrowserModelInputPreviewMessage/properties/preview/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err45];
                    } else {
                      vErrors.push(err45);
                    }
                    errors++;
                  }
                }
                if (data12.truncated !== void 0) {
                  if (typeof data12.truncated !== "boolean") {
                    const err46 = { instancePath: instancePath + "/messages/" + i0 + "/truncated", schemaPath: "#/definitions/BrowserModelInputPreviewMessage/properties/truncated/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                    if (vErrors === null) {
                      vErrors = [err46];
                    } else {
                      vErrors.push(err46);
                    }
                    errors++;
                  }
                }
              } else {
                const err47 = { instancePath: instancePath + "/messages/" + i0, schemaPath: "#/definitions/BrowserModelInputPreviewMessage/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err47];
                } else {
                  vErrors.push(err47);
                }
                errors++;
              }
            }
          } else {
            const err48 = { instancePath: instancePath + "/messages", schemaPath: "#/properties/messages/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err48];
            } else {
              vErrors.push(err48);
            }
            errors++;
          }
        }
        if (data.omittedMessageCount !== void 0) {
          let data18 = data.omittedMessageCount;
          if (!(typeof data18 == "number" && (!(data18 % 1) && !isNaN(data18)) && isFinite(data18))) {
            const err49 = { instancePath: instancePath + "/omittedMessageCount", schemaPath: "#/properties/omittedMessageCount/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err49];
            } else {
              vErrors.push(err49);
            }
            errors++;
          }
          if (typeof data18 == "number" && isFinite(data18)) {
            if (data18 > 9007199254740991 || isNaN(data18)) {
              const err50 = { instancePath: instancePath + "/omittedMessageCount", schemaPath: "#/properties/omittedMessageCount/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err50];
              } else {
                vErrors.push(err50);
              }
              errors++;
            }
            if (data18 < 0 || isNaN(data18)) {
              const err51 = { instancePath: instancePath + "/omittedMessageCount", schemaPath: "#/properties/omittedMessageCount/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err51];
              } else {
                vErrors.push(err51);
              }
              errors++;
            }
          }
        }
      } else {
        const err52 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err52];
        } else {
          vErrors.push(err52);
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
        if (data.calls === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "calls" }, message: "must have required property 'calls'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.total === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "total" }, message: "must have required property 'total'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.nextOffset === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "nextOffset" }, message: "must have required property 'nextOffset'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "calls" || key0 === "total" || key0 === "nextOffset")) {
            const err3 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.calls !== void 0) {
          let data0 = data.calls;
          if (Array.isArray(data0)) {
            const len0 = data0.length;
            for (let i0 = 0; i0 < len0; i0++) {
              if (!validate12(data0[i0], { instancePath: instancePath + "/calls/" + i0, parentData: data0, parentDataProperty: i0, rootData })) {
                vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                errors = vErrors.length;
              }
            }
          } else {
            const err4 = { instancePath: instancePath + "/calls", schemaPath: "#/properties/calls/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.total !== void 0) {
          let data2 = data.total;
          if (!(typeof data2 == "number" && (!(data2 % 1) && !isNaN(data2)) && isFinite(data2))) {
            const err5 = { instancePath: instancePath + "/total", schemaPath: "#/properties/total/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
          if (typeof data2 == "number" && isFinite(data2)) {
            if (data2 > 9007199254740991 || isNaN(data2)) {
              const err6 = { instancePath: instancePath + "/total", schemaPath: "#/properties/total/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err6];
              } else {
                vErrors.push(err6);
              }
              errors++;
            }
            if (data2 < 0 || isNaN(data2)) {
              const err7 = { instancePath: instancePath + "/total", schemaPath: "#/properties/total/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
          }
        }
        if (data.nextOffset !== void 0) {
          let data3 = data.nextOffset;
          if (!(typeof data3 == "number" && isFinite(data3)) && data3 !== null) {
            const err8 = { instancePath: instancePath + "/nextOffset", schemaPath: "#/properties/nextOffset/type", keyword: "type", params: { type: schema12.properties.nextOffset.type }, message: "must be number,null" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
          if (typeof data3 == "number" && isFinite(data3)) {
            if (data3 > 9007199254740991 || isNaN(data3)) {
              const err9 = { instancePath: instancePath + "/nextOffset", schemaPath: "#/properties/nextOffset/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
            if (data3 < 0 || isNaN(data3)) {
              const err10 = { instancePath: instancePath + "/nextOffset", schemaPath: "#/properties/nextOffset/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
          }
        }
      } else {
        const err11 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
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
export default require_BrowserModelInputs_validator();
