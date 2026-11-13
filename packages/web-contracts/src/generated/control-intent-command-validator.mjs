var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// BrowserControlIntentCommand-validator.cjs
var require_BrowserControlIntentCommand_validator = __commonJS({
  "BrowserControlIntentCommand-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema18 = { "type": "object", "properties": { "sandbox": { "type": "string", "enum": ["read-only", "workspace-write", "danger-full-access"] }, "approvals": { "type": "string", "enum": ["on-request", "never"] }, "reviewer": { "type": "string", "enum": ["user", "auto_review"] }, "writableRoots": { "type": "array", "items": { "type": "string" }, "description": "\u5DE5\u4F5C\u533A\u6811\u4E4B\u5916\u989D\u5916\u5141\u8BB8\u8BFB\u5199\u7684\u5DE5\u4F5C\u533A\u5916\u6839\u76EE\u5F55\uFF0C\u5143\u7D20\u4E3A\u7EDD\u5BF9\u8DEF\u5F84\u3002" } }, "required": ["sandbox", "approvals", "reviewer", "writableRoots"], "additionalProperties": false, "description": "\u5DE5\u4F5C\u533A\u6743\u9650\u6863\u4F4D\u7684 wire \u5F62\u72B6\u3002" };
    var schema20 = { "type": "string", "enum": ["action", "goal", "workspace"], "description": "Action \u5BA1\u9605\u53EF\u7533\u8BF7\u7684\u6388\u6743\u671F\u9650\u3002" };
    var pattern0 = new RegExp("\\S", "u");
    var schema13 = { "anyOf": [{ "type": "object", "properties": { "kind": { "type": "string", "const": "message" }, "inputId": { "type": "string", "pattern": "\\S" }, "content": { "type": "string", "pattern": "\\S" }, "runId": { "type": "string", "pattern": "\\S" } }, "required": ["kind", "inputId", "content", "runId"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "steer" }, "inputId": { "type": "string", "pattern": "\\S" }, "runId": { "type": "string", "pattern": "\\S" }, "content": { "type": "string", "pattern": "\\S" }, "queueBinding": { "$ref": "#/definitions/BrowserQueueBinding" } }, "required": ["kind", "inputId", "runId", "content"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "interrupt" }, "inputId": { "type": "string", "pattern": "\\S" }, "runId": { "type": "string", "pattern": "\\S" } }, "required": ["kind", "inputId", "runId"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "respond" }, "inputId": { "type": "string", "pattern": "\\S" }, "runId": { "type": "string", "pattern": "\\S" }, "requestId": { "type": "string", "pattern": "\\S" }, "response": { "$ref": "#/definitions/BrowserSessionInteractionResponse" } }, "required": ["kind", "inputId", "runId", "requestId", "response"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "resume" }, "inputId": { "type": "string", "pattern": "\\S" }, "runId": { "type": "string", "pattern": "\\S" }, "commitRevision": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "content": { "type": "string", "pattern": "\\S" }, "acknowledgeUnknownEffects": { "type": "boolean", "description": "\u5DF2\u786E\u8BA4 Worker \u9000\u51FA\u540E\u6062\u590D\u8FD0\u884C\u4E2D\u68C0\u67E5\u70B9\u65F6\uFF0C\u627F\u8BA4\u539F\u52A8\u4F5C\u7684\u5916\u90E8\u526F\u4F5C\u7528\u53EF\u80FD\u672A\u77E5\u3002" } }, "required": ["kind", "inputId", "runId", "commitRevision"], "additionalProperties": false }, { "type": "object", "properties": { "kind": { "type": "string", "const": "queue_control" }, "inputId": { "type": "string", "pattern": "\\S" }, "action": { "type": "string", "enum": ["continue", "clear", "remove"] }, "queueRevision": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "messageId": { "type": "string", "pattern": "\\S" } }, "required": ["kind", "inputId", "action", "queueRevision"], "additionalProperties": false }], "description": "`POST /api/goals/:goalId/inputs` \u7684\u4E25\u683C wire \u547D\u4EE4\u3002" };
    var schema16 = { "type": "string", "enum": ["action", "goal", "workspace"], "description": "wire \u4E0A\u53EF\u7528\u7684\u6388\u6743\u671F\u9650\u3002" };
    function validate13(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      const _errs0 = errors;
      let valid0 = false;
      const _errs1 = errors;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.kind === void 0) {
          const err0 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.answers === void 0) {
          const err1 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "answers" }, message: "must have required property 'answers'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "kind" || key0 === "answers")) {
            const err2 = { instancePath, schemaPath: "#/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.kind !== void 0) {
          let data0 = data.kind;
          if (typeof data0 !== "string") {
            const err3 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/0/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
          if ("answer_ask_user" !== data0) {
            const err4 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/0/properties/kind/const", keyword: "const", params: { allowedValue: "answer_ask_user" }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.answers !== void 0) {
          let data1 = data.answers;
          if (Array.isArray(data1)) {
            if (data1.length > 3) {
              const err5 = { instancePath: instancePath + "/answers", schemaPath: "#/anyOf/0/properties/answers/maxItems", keyword: "maxItems", params: { limit: 3 }, message: "must NOT have more than 3 items" };
              if (vErrors === null) {
                vErrors = [err5];
              } else {
                vErrors.push(err5);
              }
              errors++;
            }
            if (data1.length < 1) {
              const err6 = { instancePath: instancePath + "/answers", schemaPath: "#/anyOf/0/properties/answers/minItems", keyword: "minItems", params: { limit: 1 }, message: "must NOT have fewer than 1 items" };
              if (vErrors === null) {
                vErrors = [err6];
              } else {
                vErrors.push(err6);
              }
              errors++;
            }
            const len0 = data1.length;
            for (let i0 = 0; i0 < len0; i0++) {
              let data2 = data1[i0];
              if (data2 && typeof data2 == "object" && !Array.isArray(data2)) {
                if (data2.questionId === void 0) {
                  const err7 = { instancePath: instancePath + "/answers/" + i0, schemaPath: "#/anyOf/0/properties/answers/items/required", keyword: "required", params: { missingProperty: "questionId" }, message: "must have required property 'questionId'" };
                  if (vErrors === null) {
                    vErrors = [err7];
                  } else {
                    vErrors.push(err7);
                  }
                  errors++;
                }
                if (data2.optionIds === void 0) {
                  const err8 = { instancePath: instancePath + "/answers/" + i0, schemaPath: "#/anyOf/0/properties/answers/items/required", keyword: "required", params: { missingProperty: "optionIds" }, message: "must have required property 'optionIds'" };
                  if (vErrors === null) {
                    vErrors = [err8];
                  } else {
                    vErrors.push(err8);
                  }
                  errors++;
                }
                for (const key1 in data2) {
                  if (!(key1 === "questionId" || key1 === "optionIds" || key1 === "otherText")) {
                    const err9 = { instancePath: instancePath + "/answers/" + i0, schemaPath: "#/anyOf/0/properties/answers/items/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err9];
                    } else {
                      vErrors.push(err9);
                    }
                    errors++;
                  }
                }
                if (data2.questionId !== void 0) {
                  let data3 = data2.questionId;
                  if (typeof data3 === "string") {
                    if (!pattern0.test(data3)) {
                      const err10 = { instancePath: instancePath + "/answers/" + i0 + "/questionId", schemaPath: "#/anyOf/0/properties/answers/items/properties/questionId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err10];
                      } else {
                        vErrors.push(err10);
                      }
                      errors++;
                    }
                  } else {
                    const err11 = { instancePath: instancePath + "/answers/" + i0 + "/questionId", schemaPath: "#/anyOf/0/properties/answers/items/properties/questionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err11];
                    } else {
                      vErrors.push(err11);
                    }
                    errors++;
                  }
                }
                if (data2.optionIds !== void 0) {
                  let data4 = data2.optionIds;
                  if (Array.isArray(data4)) {
                    if (data4.length > 3) {
                      const err12 = { instancePath: instancePath + "/answers/" + i0 + "/optionIds", schemaPath: "#/anyOf/0/properties/answers/items/properties/optionIds/maxItems", keyword: "maxItems", params: { limit: 3 }, message: "must NOT have more than 3 items" };
                      if (vErrors === null) {
                        vErrors = [err12];
                      } else {
                        vErrors.push(err12);
                      }
                      errors++;
                    }
                    const len1 = data4.length;
                    for (let i1 = 0; i1 < len1; i1++) {
                      if (typeof data4[i1] !== "string") {
                        const err13 = { instancePath: instancePath + "/answers/" + i0 + "/optionIds/" + i1, schemaPath: "#/anyOf/0/properties/answers/items/properties/optionIds/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err13];
                        } else {
                          vErrors.push(err13);
                        }
                        errors++;
                      }
                    }
                  } else {
                    const err14 = { instancePath: instancePath + "/answers/" + i0 + "/optionIds", schemaPath: "#/anyOf/0/properties/answers/items/properties/optionIds/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                    if (vErrors === null) {
                      vErrors = [err14];
                    } else {
                      vErrors.push(err14);
                    }
                    errors++;
                  }
                }
                if (data2.otherText !== void 0) {
                  let data6 = data2.otherText;
                  if (typeof data6 === "string") {
                    if (!pattern0.test(data6)) {
                      const err15 = { instancePath: instancePath + "/answers/" + i0 + "/otherText", schemaPath: "#/anyOf/0/properties/answers/items/properties/otherText/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err15];
                      } else {
                        vErrors.push(err15);
                      }
                      errors++;
                    }
                  } else {
                    const err16 = { instancePath: instancePath + "/answers/" + i0 + "/otherText", schemaPath: "#/anyOf/0/properties/answers/items/properties/otherText/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err16];
                    } else {
                      vErrors.push(err16);
                    }
                    errors++;
                  }
                }
              } else {
                const err17 = { instancePath: instancePath + "/answers/" + i0, schemaPath: "#/anyOf/0/properties/answers/items/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err17];
                } else {
                  vErrors.push(err17);
                }
                errors++;
              }
            }
          } else {
            const err18 = { instancePath: instancePath + "/answers", schemaPath: "#/anyOf/0/properties/answers/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err18];
            } else {
              vErrors.push(err18);
            }
            errors++;
          }
        }
      } else {
        const err19 = { instancePath, schemaPath: "#/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err19];
        } else {
          vErrors.push(err19);
        }
        errors++;
      }
      var _valid0 = _errs1 === errors;
      valid0 = valid0 || _valid0;
      if (!valid0) {
        const _errs19 = errors;
        if (data && typeof data == "object" && !Array.isArray(data)) {
          if (data.kind === void 0) {
            const err20 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
            if (vErrors === null) {
              vErrors = [err20];
            } else {
              vErrors.push(err20);
            }
            errors++;
          }
          if (data.content === void 0) {
            const err21 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "content" }, message: "must have required property 'content'" };
            if (vErrors === null) {
              vErrors = [err21];
            } else {
              vErrors.push(err21);
            }
            errors++;
          }
          for (const key2 in data) {
            if (!(key2 === "kind" || key2 === "content")) {
              const err22 = { instancePath, schemaPath: "#/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
              if (vErrors === null) {
                vErrors = [err22];
              } else {
                vErrors.push(err22);
              }
              errors++;
            }
          }
          if (data.kind !== void 0) {
            let data7 = data.kind;
            if (typeof data7 !== "string") {
              const err23 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/1/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err23];
              } else {
                vErrors.push(err23);
              }
              errors++;
            }
            if ("reply_to_question" !== data7) {
              const err24 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/1/properties/kind/const", keyword: "const", params: { allowedValue: "reply_to_question" }, message: "must be equal to constant" };
              if (vErrors === null) {
                vErrors = [err24];
              } else {
                vErrors.push(err24);
              }
              errors++;
            }
          }
          if (data.content !== void 0) {
            let data8 = data.content;
            if (typeof data8 === "string") {
              if (!pattern0.test(data8)) {
                const err25 = { instancePath: instancePath + "/content", schemaPath: "#/anyOf/1/properties/content/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                if (vErrors === null) {
                  vErrors = [err25];
                } else {
                  vErrors.push(err25);
                }
                errors++;
              }
            } else {
              const err26 = { instancePath: instancePath + "/content", schemaPath: "#/anyOf/1/properties/content/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err26];
              } else {
                vErrors.push(err26);
              }
              errors++;
            }
          }
        } else {
          const err27 = { instancePath, schemaPath: "#/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
          if (vErrors === null) {
            vErrors = [err27];
          } else {
            vErrors.push(err27);
          }
          errors++;
        }
        var _valid0 = _errs19 === errors;
        valid0 = valid0 || _valid0;
        if (!valid0) {
          const _errs26 = errors;
          if (data && typeof data == "object" && !Array.isArray(data)) {
            if (data.kind === void 0) {
              const err28 = { instancePath, schemaPath: "#/anyOf/2/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
              if (vErrors === null) {
                vErrors = [err28];
              } else {
                vErrors.push(err28);
              }
              errors++;
            }
            for (const key3 in data) {
              if (!(key3 === "kind")) {
                const err29 = { instancePath, schemaPath: "#/anyOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err29];
                } else {
                  vErrors.push(err29);
                }
                errors++;
              }
            }
            if (data.kind !== void 0) {
              let data9 = data.kind;
              if (typeof data9 !== "string") {
                const err30 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/2/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err30];
                } else {
                  vErrors.push(err30);
                }
                errors++;
              }
              if ("skip_question" !== data9) {
                const err31 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/2/properties/kind/const", keyword: "const", params: { allowedValue: "skip_question" }, message: "must be equal to constant" };
                if (vErrors === null) {
                  vErrors = [err31];
                } else {
                  vErrors.push(err31);
                }
                errors++;
              }
            }
          } else {
            const err32 = { instancePath, schemaPath: "#/anyOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err32];
            } else {
              vErrors.push(err32);
            }
            errors++;
          }
          var _valid0 = _errs26 === errors;
          valid0 = valid0 || _valid0;
          if (!valid0) {
            const _errs31 = errors;
            if (data && typeof data == "object" && !Array.isArray(data)) {
              if (data.kind === void 0) {
                const err33 = { instancePath, schemaPath: "#/anyOf/3/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                if (vErrors === null) {
                  vErrors = [err33];
                } else {
                  vErrors.push(err33);
                }
                errors++;
              }
              for (const key4 in data) {
                if (!(key4 === "kind")) {
                  const err34 = { instancePath, schemaPath: "#/anyOf/3/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key4 }, message: "must NOT have additional properties" };
                  if (vErrors === null) {
                    vErrors = [err34];
                  } else {
                    vErrors.push(err34);
                  }
                  errors++;
                }
              }
              if (data.kind !== void 0) {
                let data10 = data.kind;
                if (typeof data10 !== "string") {
                  const err35 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/3/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err35];
                  } else {
                    vErrors.push(err35);
                  }
                  errors++;
                }
                if ("approve_task" !== data10) {
                  const err36 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/3/properties/kind/const", keyword: "const", params: { allowedValue: "approve_task" }, message: "must be equal to constant" };
                  if (vErrors === null) {
                    vErrors = [err36];
                  } else {
                    vErrors.push(err36);
                  }
                  errors++;
                }
              }
            } else {
              const err37 = { instancePath, schemaPath: "#/anyOf/3/type", keyword: "type", params: { type: "object" }, message: "must be object" };
              if (vErrors === null) {
                vErrors = [err37];
              } else {
                vErrors.push(err37);
              }
              errors++;
            }
            var _valid0 = _errs31 === errors;
            valid0 = valid0 || _valid0;
            if (!valid0) {
              const _errs36 = errors;
              if (data && typeof data == "object" && !Array.isArray(data)) {
                if (data.kind === void 0) {
                  const err38 = { instancePath, schemaPath: "#/anyOf/4/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                  if (vErrors === null) {
                    vErrors = [err38];
                  } else {
                    vErrors.push(err38);
                  }
                  errors++;
                }
                if (data.feedback === void 0) {
                  const err39 = { instancePath, schemaPath: "#/anyOf/4/required", keyword: "required", params: { missingProperty: "feedback" }, message: "must have required property 'feedback'" };
                  if (vErrors === null) {
                    vErrors = [err39];
                  } else {
                    vErrors.push(err39);
                  }
                  errors++;
                }
                for (const key5 in data) {
                  if (!(key5 === "kind" || key5 === "feedback")) {
                    const err40 = { instancePath, schemaPath: "#/anyOf/4/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key5 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err40];
                    } else {
                      vErrors.push(err40);
                    }
                    errors++;
                  }
                }
                if (data.kind !== void 0) {
                  let data11 = data.kind;
                  if (typeof data11 !== "string") {
                    const err41 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/4/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err41];
                    } else {
                      vErrors.push(err41);
                    }
                    errors++;
                  }
                  if ("feedback_task" !== data11) {
                    const err42 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/4/properties/kind/const", keyword: "const", params: { allowedValue: "feedback_task" }, message: "must be equal to constant" };
                    if (vErrors === null) {
                      vErrors = [err42];
                    } else {
                      vErrors.push(err42);
                    }
                    errors++;
                  }
                }
                if (data.feedback !== void 0) {
                  let data12 = data.feedback;
                  if (typeof data12 === "string") {
                    if (!pattern0.test(data12)) {
                      const err43 = { instancePath: instancePath + "/feedback", schemaPath: "#/anyOf/4/properties/feedback/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err43];
                      } else {
                        vErrors.push(err43);
                      }
                      errors++;
                    }
                  } else {
                    const err44 = { instancePath: instancePath + "/feedback", schemaPath: "#/anyOf/4/properties/feedback/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err44];
                    } else {
                      vErrors.push(err44);
                    }
                    errors++;
                  }
                }
              } else {
                const err45 = { instancePath, schemaPath: "#/anyOf/4/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err45];
                } else {
                  vErrors.push(err45);
                }
                errors++;
              }
              var _valid0 = _errs36 === errors;
              valid0 = valid0 || _valid0;
              if (!valid0) {
                const _errs43 = errors;
                if (data && typeof data == "object" && !Array.isArray(data)) {
                  if (data.kind === void 0) {
                    const err46 = { instancePath, schemaPath: "#/anyOf/5/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                    if (vErrors === null) {
                      vErrors = [err46];
                    } else {
                      vErrors.push(err46);
                    }
                    errors++;
                  }
                  if (data.actionId === void 0) {
                    const err47 = { instancePath, schemaPath: "#/anyOf/5/required", keyword: "required", params: { missingProperty: "actionId" }, message: "must have required property 'actionId'" };
                    if (vErrors === null) {
                      vErrors = [err47];
                    } else {
                      vErrors.push(err47);
                    }
                    errors++;
                  }
                  for (const key6 in data) {
                    if (!(key6 === "kind" || key6 === "actionId" || key6 === "scope")) {
                      const err48 = { instancePath, schemaPath: "#/anyOf/5/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key6 }, message: "must NOT have additional properties" };
                      if (vErrors === null) {
                        vErrors = [err48];
                      } else {
                        vErrors.push(err48);
                      }
                      errors++;
                    }
                  }
                  if (data.kind !== void 0) {
                    let data13 = data.kind;
                    if (typeof data13 !== "string") {
                      const err49 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/5/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err49];
                      } else {
                        vErrors.push(err49);
                      }
                      errors++;
                    }
                    if ("approve_action" !== data13) {
                      const err50 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/5/properties/kind/const", keyword: "const", params: { allowedValue: "approve_action" }, message: "must be equal to constant" };
                      if (vErrors === null) {
                        vErrors = [err50];
                      } else {
                        vErrors.push(err50);
                      }
                      errors++;
                    }
                  }
                  if (data.actionId !== void 0) {
                    let data14 = data.actionId;
                    if (typeof data14 === "string") {
                      if (!pattern0.test(data14)) {
                        const err51 = { instancePath: instancePath + "/actionId", schemaPath: "#/anyOf/5/properties/actionId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                        if (vErrors === null) {
                          vErrors = [err51];
                        } else {
                          vErrors.push(err51);
                        }
                        errors++;
                      }
                    } else {
                      const err52 = { instancePath: instancePath + "/actionId", schemaPath: "#/anyOf/5/properties/actionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err52];
                      } else {
                        vErrors.push(err52);
                      }
                      errors++;
                    }
                  }
                  if (data.scope !== void 0) {
                    let data15 = data.scope;
                    if (typeof data15 !== "string") {
                      const err53 = { instancePath: instancePath + "/scope", schemaPath: "#/definitions/BrowserGrantScope/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err53];
                      } else {
                        vErrors.push(err53);
                      }
                      errors++;
                    }
                    if (!(data15 === "action" || data15 === "goal" || data15 === "workspace")) {
                      const err54 = { instancePath: instancePath + "/scope", schemaPath: "#/definitions/BrowserGrantScope/enum", keyword: "enum", params: { allowedValues: schema16.enum }, message: "must be equal to one of the allowed values" };
                      if (vErrors === null) {
                        vErrors = [err54];
                      } else {
                        vErrors.push(err54);
                      }
                      errors++;
                    }
                  }
                } else {
                  const err55 = { instancePath, schemaPath: "#/anyOf/5/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                  if (vErrors === null) {
                    vErrors = [err55];
                  } else {
                    vErrors.push(err55);
                  }
                  errors++;
                }
                var _valid0 = _errs43 === errors;
                valid0 = valid0 || _valid0;
                if (!valid0) {
                  const _errs53 = errors;
                  if (data && typeof data == "object" && !Array.isArray(data)) {
                    if (data.kind === void 0) {
                      const err56 = { instancePath, schemaPath: "#/anyOf/6/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                      if (vErrors === null) {
                        vErrors = [err56];
                      } else {
                        vErrors.push(err56);
                      }
                      errors++;
                    }
                    if (data.actionId === void 0) {
                      const err57 = { instancePath, schemaPath: "#/anyOf/6/required", keyword: "required", params: { missingProperty: "actionId" }, message: "must have required property 'actionId'" };
                      if (vErrors === null) {
                        vErrors = [err57];
                      } else {
                        vErrors.push(err57);
                      }
                      errors++;
                    }
                    if (data.input === void 0) {
                      const err58 = { instancePath, schemaPath: "#/anyOf/6/required", keyword: "required", params: { missingProperty: "input" }, message: "must have required property 'input'" };
                      if (vErrors === null) {
                        vErrors = [err58];
                      } else {
                        vErrors.push(err58);
                      }
                      errors++;
                    }
                    if (data.reviewRef === void 0) {
                      const err59 = { instancePath, schemaPath: "#/anyOf/6/required", keyword: "required", params: { missingProperty: "reviewRef" }, message: "must have required property 'reviewRef'" };
                      if (vErrors === null) {
                        vErrors = [err59];
                      } else {
                        vErrors.push(err59);
                      }
                      errors++;
                    }
                    for (const key7 in data) {
                      if (!(key7 === "kind" || key7 === "actionId" || key7 === "input" || key7 === "reviewRef" || key7 === "scope")) {
                        const err60 = { instancePath, schemaPath: "#/anyOf/6/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key7 }, message: "must NOT have additional properties" };
                        if (vErrors === null) {
                          vErrors = [err60];
                        } else {
                          vErrors.push(err60);
                        }
                        errors++;
                      }
                    }
                    if (data.kind !== void 0) {
                      let data16 = data.kind;
                      if (typeof data16 !== "string") {
                        const err61 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/6/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err61];
                        } else {
                          vErrors.push(err61);
                        }
                        errors++;
                      }
                      if ("approve_action_revision" !== data16) {
                        const err62 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/6/properties/kind/const", keyword: "const", params: { allowedValue: "approve_action_revision" }, message: "must be equal to constant" };
                        if (vErrors === null) {
                          vErrors = [err62];
                        } else {
                          vErrors.push(err62);
                        }
                        errors++;
                      }
                    }
                    if (data.actionId !== void 0) {
                      let data17 = data.actionId;
                      if (typeof data17 === "string") {
                        if (!pattern0.test(data17)) {
                          const err63 = { instancePath: instancePath + "/actionId", schemaPath: "#/anyOf/6/properties/actionId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                          if (vErrors === null) {
                            vErrors = [err63];
                          } else {
                            vErrors.push(err63);
                          }
                          errors++;
                        }
                      } else {
                        const err64 = { instancePath: instancePath + "/actionId", schemaPath: "#/anyOf/6/properties/actionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err64];
                        } else {
                          vErrors.push(err64);
                        }
                        errors++;
                      }
                    }
                    if (data.reviewRef !== void 0) {
                      let data18 = data.reviewRef;
                      if (typeof data18 === "string") {
                        if (!pattern0.test(data18)) {
                          const err65 = { instancePath: instancePath + "/reviewRef", schemaPath: "#/anyOf/6/properties/reviewRef/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                          if (vErrors === null) {
                            vErrors = [err65];
                          } else {
                            vErrors.push(err65);
                          }
                          errors++;
                        }
                      } else {
                        const err66 = { instancePath: instancePath + "/reviewRef", schemaPath: "#/anyOf/6/properties/reviewRef/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err66];
                        } else {
                          vErrors.push(err66);
                        }
                        errors++;
                      }
                    }
                    if (data.scope !== void 0) {
                      let data19 = data.scope;
                      if (typeof data19 !== "string") {
                        const err67 = { instancePath: instancePath + "/scope", schemaPath: "#/definitions/BrowserGrantScope/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err67];
                        } else {
                          vErrors.push(err67);
                        }
                        errors++;
                      }
                      if (!(data19 === "action" || data19 === "goal" || data19 === "workspace")) {
                        const err68 = { instancePath: instancePath + "/scope", schemaPath: "#/definitions/BrowserGrantScope/enum", keyword: "enum", params: { allowedValues: schema16.enum }, message: "must be equal to one of the allowed values" };
                        if (vErrors === null) {
                          vErrors = [err68];
                        } else {
                          vErrors.push(err68);
                        }
                        errors++;
                      }
                    }
                  } else {
                    const err69 = { instancePath, schemaPath: "#/anyOf/6/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                    if (vErrors === null) {
                      vErrors = [err69];
                    } else {
                      vErrors.push(err69);
                    }
                    errors++;
                  }
                  var _valid0 = _errs53 === errors;
                  valid0 = valid0 || _valid0;
                  if (!valid0) {
                    const _errs65 = errors;
                    if (data && typeof data == "object" && !Array.isArray(data)) {
                      if (data.kind === void 0) {
                        const err70 = { instancePath, schemaPath: "#/anyOf/7/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                        if (vErrors === null) {
                          vErrors = [err70];
                        } else {
                          vErrors.push(err70);
                        }
                        errors++;
                      }
                      if (data.actionId === void 0) {
                        const err71 = { instancePath, schemaPath: "#/anyOf/7/required", keyword: "required", params: { missingProperty: "actionId" }, message: "must have required property 'actionId'" };
                        if (vErrors === null) {
                          vErrors = [err71];
                        } else {
                          vErrors.push(err71);
                        }
                        errors++;
                      }
                      if (data.recoveryRef === void 0) {
                        const err72 = { instancePath, schemaPath: "#/anyOf/7/required", keyword: "required", params: { missingProperty: "recoveryRef" }, message: "must have required property 'recoveryRef'" };
                        if (vErrors === null) {
                          vErrors = [err72];
                        } else {
                          vErrors.push(err72);
                        }
                        errors++;
                      }
                      for (const key8 in data) {
                        if (!(key8 === "kind" || key8 === "actionId" || key8 === "recoveryRef")) {
                          const err73 = { instancePath, schemaPath: "#/anyOf/7/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key8 }, message: "must NOT have additional properties" };
                          if (vErrors === null) {
                            vErrors = [err73];
                          } else {
                            vErrors.push(err73);
                          }
                          errors++;
                        }
                      }
                      if (data.kind !== void 0) {
                        let data20 = data.kind;
                        if (typeof data20 !== "string") {
                          const err74 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/7/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err74];
                          } else {
                            vErrors.push(err74);
                          }
                          errors++;
                        }
                        if ("retry_unknown_action" !== data20) {
                          const err75 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/7/properties/kind/const", keyword: "const", params: { allowedValue: "retry_unknown_action" }, message: "must be equal to constant" };
                          if (vErrors === null) {
                            vErrors = [err75];
                          } else {
                            vErrors.push(err75);
                          }
                          errors++;
                        }
                      }
                      if (data.actionId !== void 0) {
                        let data21 = data.actionId;
                        if (typeof data21 === "string") {
                          if (!pattern0.test(data21)) {
                            const err76 = { instancePath: instancePath + "/actionId", schemaPath: "#/anyOf/7/properties/actionId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                            if (vErrors === null) {
                              vErrors = [err76];
                            } else {
                              vErrors.push(err76);
                            }
                            errors++;
                          }
                        } else {
                          const err77 = { instancePath: instancePath + "/actionId", schemaPath: "#/anyOf/7/properties/actionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err77];
                          } else {
                            vErrors.push(err77);
                          }
                          errors++;
                        }
                      }
                      if (data.recoveryRef !== void 0) {
                        let data22 = data.recoveryRef;
                        if (typeof data22 === "string") {
                          if (!pattern0.test(data22)) {
                            const err78 = { instancePath: instancePath + "/recoveryRef", schemaPath: "#/anyOf/7/properties/recoveryRef/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                            if (vErrors === null) {
                              vErrors = [err78];
                            } else {
                              vErrors.push(err78);
                            }
                            errors++;
                          }
                        } else {
                          const err79 = { instancePath: instancePath + "/recoveryRef", schemaPath: "#/anyOf/7/properties/recoveryRef/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err79];
                          } else {
                            vErrors.push(err79);
                          }
                          errors++;
                        }
                      }
                    } else {
                      const err80 = { instancePath, schemaPath: "#/anyOf/7/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                      if (vErrors === null) {
                        vErrors = [err80];
                      } else {
                        vErrors.push(err80);
                      }
                      errors++;
                    }
                    var _valid0 = _errs65 === errors;
                    valid0 = valid0 || _valid0;
                    if (!valid0) {
                      const _errs74 = errors;
                      if (data && typeof data == "object" && !Array.isArray(data)) {
                        if (data.kind === void 0) {
                          const err81 = { instancePath, schemaPath: "#/anyOf/8/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                          if (vErrors === null) {
                            vErrors = [err81];
                          } else {
                            vErrors.push(err81);
                          }
                          errors++;
                        }
                        if (data.actionId === void 0) {
                          const err82 = { instancePath, schemaPath: "#/anyOf/8/required", keyword: "required", params: { missingProperty: "actionId" }, message: "must have required property 'actionId'" };
                          if (vErrors === null) {
                            vErrors = [err82];
                          } else {
                            vErrors.push(err82);
                          }
                          errors++;
                        }
                        if (data.recoveryRef === void 0) {
                          const err83 = { instancePath, schemaPath: "#/anyOf/8/required", keyword: "required", params: { missingProperty: "recoveryRef" }, message: "must have required property 'recoveryRef'" };
                          if (vErrors === null) {
                            vErrors = [err83];
                          } else {
                            vErrors.push(err83);
                          }
                          errors++;
                        }
                        if (data.reason === void 0) {
                          const err84 = { instancePath, schemaPath: "#/anyOf/8/required", keyword: "required", params: { missingProperty: "reason" }, message: "must have required property 'reason'" };
                          if (vErrors === null) {
                            vErrors = [err84];
                          } else {
                            vErrors.push(err84);
                          }
                          errors++;
                        }
                        for (const key9 in data) {
                          if (!(key9 === "kind" || key9 === "actionId" || key9 === "recoveryRef" || key9 === "reason")) {
                            const err85 = { instancePath, schemaPath: "#/anyOf/8/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key9 }, message: "must NOT have additional properties" };
                            if (vErrors === null) {
                              vErrors = [err85];
                            } else {
                              vErrors.push(err85);
                            }
                            errors++;
                          }
                        }
                        if (data.kind !== void 0) {
                          let data23 = data.kind;
                          if (typeof data23 !== "string") {
                            const err86 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/8/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err86];
                            } else {
                              vErrors.push(err86);
                            }
                            errors++;
                          }
                          if ("decline_unknown_action_retry" !== data23) {
                            const err87 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/8/properties/kind/const", keyword: "const", params: { allowedValue: "decline_unknown_action_retry" }, message: "must be equal to constant" };
                            if (vErrors === null) {
                              vErrors = [err87];
                            } else {
                              vErrors.push(err87);
                            }
                            errors++;
                          }
                        }
                        if (data.actionId !== void 0) {
                          let data24 = data.actionId;
                          if (typeof data24 === "string") {
                            if (!pattern0.test(data24)) {
                              const err88 = { instancePath: instancePath + "/actionId", schemaPath: "#/anyOf/8/properties/actionId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                              if (vErrors === null) {
                                vErrors = [err88];
                              } else {
                                vErrors.push(err88);
                              }
                              errors++;
                            }
                          } else {
                            const err89 = { instancePath: instancePath + "/actionId", schemaPath: "#/anyOf/8/properties/actionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err89];
                            } else {
                              vErrors.push(err89);
                            }
                            errors++;
                          }
                        }
                        if (data.recoveryRef !== void 0) {
                          let data25 = data.recoveryRef;
                          if (typeof data25 === "string") {
                            if (!pattern0.test(data25)) {
                              const err90 = { instancePath: instancePath + "/recoveryRef", schemaPath: "#/anyOf/8/properties/recoveryRef/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                              if (vErrors === null) {
                                vErrors = [err90];
                              } else {
                                vErrors.push(err90);
                              }
                              errors++;
                            }
                          } else {
                            const err91 = { instancePath: instancePath + "/recoveryRef", schemaPath: "#/anyOf/8/properties/recoveryRef/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err91];
                            } else {
                              vErrors.push(err91);
                            }
                            errors++;
                          }
                        }
                        if (data.reason !== void 0) {
                          let data26 = data.reason;
                          if (typeof data26 === "string") {
                            if (!pattern0.test(data26)) {
                              const err92 = { instancePath: instancePath + "/reason", schemaPath: "#/anyOf/8/properties/reason/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                              if (vErrors === null) {
                                vErrors = [err92];
                              } else {
                                vErrors.push(err92);
                              }
                              errors++;
                            }
                          } else {
                            const err93 = { instancePath: instancePath + "/reason", schemaPath: "#/anyOf/8/properties/reason/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err93];
                            } else {
                              vErrors.push(err93);
                            }
                            errors++;
                          }
                        }
                      } else {
                        const err94 = { instancePath, schemaPath: "#/anyOf/8/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                        if (vErrors === null) {
                          vErrors = [err94];
                        } else {
                          vErrors.push(err94);
                        }
                        errors++;
                      }
                      var _valid0 = _errs74 === errors;
                      valid0 = valid0 || _valid0;
                      if (!valid0) {
                        const _errs85 = errors;
                        if (data && typeof data == "object" && !Array.isArray(data)) {
                          if (data.kind === void 0) {
                            const err95 = { instancePath, schemaPath: "#/anyOf/9/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                            if (vErrors === null) {
                              vErrors = [err95];
                            } else {
                              vErrors.push(err95);
                            }
                            errors++;
                          }
                          if (data.actionId === void 0) {
                            const err96 = { instancePath, schemaPath: "#/anyOf/9/required", keyword: "required", params: { missingProperty: "actionId" }, message: "must have required property 'actionId'" };
                            if (vErrors === null) {
                              vErrors = [err96];
                            } else {
                              vErrors.push(err96);
                            }
                            errors++;
                          }
                          if (data.reason === void 0) {
                            const err97 = { instancePath, schemaPath: "#/anyOf/9/required", keyword: "required", params: { missingProperty: "reason" }, message: "must have required property 'reason'" };
                            if (vErrors === null) {
                              vErrors = [err97];
                            } else {
                              vErrors.push(err97);
                            }
                            errors++;
                          }
                          for (const key10 in data) {
                            if (!(key10 === "kind" || key10 === "actionId" || key10 === "reason")) {
                              const err98 = { instancePath, schemaPath: "#/anyOf/9/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key10 }, message: "must NOT have additional properties" };
                              if (vErrors === null) {
                                vErrors = [err98];
                              } else {
                                vErrors.push(err98);
                              }
                              errors++;
                            }
                          }
                          if (data.kind !== void 0) {
                            let data27 = data.kind;
                            if (typeof data27 !== "string") {
                              const err99 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/9/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                              if (vErrors === null) {
                                vErrors = [err99];
                              } else {
                                vErrors.push(err99);
                              }
                              errors++;
                            }
                            if ("reject_action" !== data27) {
                              const err100 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/9/properties/kind/const", keyword: "const", params: { allowedValue: "reject_action" }, message: "must be equal to constant" };
                              if (vErrors === null) {
                                vErrors = [err100];
                              } else {
                                vErrors.push(err100);
                              }
                              errors++;
                            }
                          }
                          if (data.actionId !== void 0) {
                            let data28 = data.actionId;
                            if (typeof data28 === "string") {
                              if (!pattern0.test(data28)) {
                                const err101 = { instancePath: instancePath + "/actionId", schemaPath: "#/anyOf/9/properties/actionId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                                if (vErrors === null) {
                                  vErrors = [err101];
                                } else {
                                  vErrors.push(err101);
                                }
                                errors++;
                              }
                            } else {
                              const err102 = { instancePath: instancePath + "/actionId", schemaPath: "#/anyOf/9/properties/actionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                              if (vErrors === null) {
                                vErrors = [err102];
                              } else {
                                vErrors.push(err102);
                              }
                              errors++;
                            }
                          }
                          if (data.reason !== void 0) {
                            let data29 = data.reason;
                            if (typeof data29 === "string") {
                              if (!pattern0.test(data29)) {
                                const err103 = { instancePath: instancePath + "/reason", schemaPath: "#/anyOf/9/properties/reason/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                                if (vErrors === null) {
                                  vErrors = [err103];
                                } else {
                                  vErrors.push(err103);
                                }
                                errors++;
                              }
                            } else {
                              const err104 = { instancePath: instancePath + "/reason", schemaPath: "#/anyOf/9/properties/reason/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                              if (vErrors === null) {
                                vErrors = [err104];
                              } else {
                                vErrors.push(err104);
                              }
                              errors++;
                            }
                          }
                        } else {
                          const err105 = { instancePath, schemaPath: "#/anyOf/9/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                          if (vErrors === null) {
                            vErrors = [err105];
                          } else {
                            vErrors.push(err105);
                          }
                          errors++;
                        }
                        var _valid0 = _errs85 === errors;
                        valid0 = valid0 || _valid0;
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
      if (!valid0) {
        const err106 = { instancePath, schemaPath: "#/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err106];
        } else {
          vErrors.push(err106);
        }
        errors++;
      } else {
        errors = _errs0;
        if (vErrors !== null) {
          if (_errs0) {
            vErrors.length = _errs0;
          } else {
            vErrors = null;
          }
        }
      }
      validate13.errors = vErrors;
      return errors === 0;
    }
    function validate12(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      const _errs0 = errors;
      let valid0 = false;
      const _errs1 = errors;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.kind === void 0) {
          const err0 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.inputId === void 0) {
          const err1 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "inputId" }, message: "must have required property 'inputId'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.content === void 0) {
          const err2 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "content" }, message: "must have required property 'content'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.runId === void 0) {
          const err3 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "kind" || key0 === "inputId" || key0 === "content" || key0 === "runId")) {
            const err4 = { instancePath, schemaPath: "#/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.kind !== void 0) {
          let data0 = data.kind;
          if (typeof data0 !== "string") {
            const err5 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/0/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
          if ("message" !== data0) {
            const err6 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/0/properties/kind/const", keyword: "const", params: { allowedValue: "message" }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data.inputId !== void 0) {
          let data1 = data.inputId;
          if (typeof data1 === "string") {
            if (!pattern0.test(data1)) {
              const err7 = { instancePath: instancePath + "/inputId", schemaPath: "#/anyOf/0/properties/inputId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
          } else {
            const err8 = { instancePath: instancePath + "/inputId", schemaPath: "#/anyOf/0/properties/inputId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data.content !== void 0) {
          let data2 = data.content;
          if (typeof data2 === "string") {
            if (!pattern0.test(data2)) {
              const err9 = { instancePath: instancePath + "/content", schemaPath: "#/anyOf/0/properties/content/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
          } else {
            const err10 = { instancePath: instancePath + "/content", schemaPath: "#/anyOf/0/properties/content/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data.runId !== void 0) {
          let data3 = data.runId;
          if (typeof data3 === "string") {
            if (!pattern0.test(data3)) {
              const err11 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/0/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err11];
              } else {
                vErrors.push(err11);
              }
              errors++;
            }
          } else {
            const err12 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/0/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
        }
      } else {
        const err13 = { instancePath, schemaPath: "#/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
      var _valid0 = _errs1 === errors;
      valid0 = valid0 || _valid0;
      if (!valid0) {
        const _errs12 = errors;
        if (data && typeof data == "object" && !Array.isArray(data)) {
          if (data.kind === void 0) {
            const err14 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
          if (data.inputId === void 0) {
            const err15 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "inputId" }, message: "must have required property 'inputId'" };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
          if (data.runId === void 0) {
            const err16 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
            if (vErrors === null) {
              vErrors = [err16];
            } else {
              vErrors.push(err16);
            }
            errors++;
          }
          if (data.content === void 0) {
            const err17 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "content" }, message: "must have required property 'content'" };
            if (vErrors === null) {
              vErrors = [err17];
            } else {
              vErrors.push(err17);
            }
            errors++;
          }
          for (const key1 in data) {
            if (!(key1 === "kind" || key1 === "inputId" || key1 === "runId" || key1 === "content" || key1 === "queueBinding")) {
              const err18 = { instancePath, schemaPath: "#/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
          }
          if (data.kind !== void 0) {
            let data4 = data.kind;
            if (typeof data4 !== "string") {
              const err19 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/1/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err19];
              } else {
                vErrors.push(err19);
              }
              errors++;
            }
            if ("steer" !== data4) {
              const err20 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/1/properties/kind/const", keyword: "const", params: { allowedValue: "steer" }, message: "must be equal to constant" };
              if (vErrors === null) {
                vErrors = [err20];
              } else {
                vErrors.push(err20);
              }
              errors++;
            }
          }
          if (data.inputId !== void 0) {
            let data5 = data.inputId;
            if (typeof data5 === "string") {
              if (!pattern0.test(data5)) {
                const err21 = { instancePath: instancePath + "/inputId", schemaPath: "#/anyOf/1/properties/inputId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                if (vErrors === null) {
                  vErrors = [err21];
                } else {
                  vErrors.push(err21);
                }
                errors++;
              }
            } else {
              const err22 = { instancePath: instancePath + "/inputId", schemaPath: "#/anyOf/1/properties/inputId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err22];
              } else {
                vErrors.push(err22);
              }
              errors++;
            }
          }
          if (data.runId !== void 0) {
            let data6 = data.runId;
            if (typeof data6 === "string") {
              if (!pattern0.test(data6)) {
                const err23 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/1/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                if (vErrors === null) {
                  vErrors = [err23];
                } else {
                  vErrors.push(err23);
                }
                errors++;
              }
            } else {
              const err24 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/1/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err24];
              } else {
                vErrors.push(err24);
              }
              errors++;
            }
          }
          if (data.content !== void 0) {
            let data7 = data.content;
            if (typeof data7 === "string") {
              if (!pattern0.test(data7)) {
                const err25 = { instancePath: instancePath + "/content", schemaPath: "#/anyOf/1/properties/content/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                if (vErrors === null) {
                  vErrors = [err25];
                } else {
                  vErrors.push(err25);
                }
                errors++;
              }
            } else {
              const err26 = { instancePath: instancePath + "/content", schemaPath: "#/anyOf/1/properties/content/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err26];
              } else {
                vErrors.push(err26);
              }
              errors++;
            }
          }
          if (data.queueBinding !== void 0) {
            let data8 = data.queueBinding;
            if (data8 && typeof data8 == "object" && !Array.isArray(data8)) {
              if (data8.messageId === void 0) {
                const err27 = { instancePath: instancePath + "/queueBinding", schemaPath: "#/definitions/BrowserQueueBinding/required", keyword: "required", params: { missingProperty: "messageId" }, message: "must have required property 'messageId'" };
                if (vErrors === null) {
                  vErrors = [err27];
                } else {
                  vErrors.push(err27);
                }
                errors++;
              }
              if (data8.queueRevision === void 0) {
                const err28 = { instancePath: instancePath + "/queueBinding", schemaPath: "#/definitions/BrowserQueueBinding/required", keyword: "required", params: { missingProperty: "queueRevision" }, message: "must have required property 'queueRevision'" };
                if (vErrors === null) {
                  vErrors = [err28];
                } else {
                  vErrors.push(err28);
                }
                errors++;
              }
              for (const key2 in data8) {
                if (!(key2 === "messageId" || key2 === "queueRevision")) {
                  const err29 = { instancePath: instancePath + "/queueBinding", schemaPath: "#/definitions/BrowserQueueBinding/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                  if (vErrors === null) {
                    vErrors = [err29];
                  } else {
                    vErrors.push(err29);
                  }
                  errors++;
                }
              }
              if (data8.messageId !== void 0) {
                let data9 = data8.messageId;
                if (typeof data9 === "string") {
                  if (!pattern0.test(data9)) {
                    const err30 = { instancePath: instancePath + "/queueBinding/messageId", schemaPath: "#/definitions/BrowserQueueBinding/properties/messageId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                    if (vErrors === null) {
                      vErrors = [err30];
                    } else {
                      vErrors.push(err30);
                    }
                    errors++;
                  }
                } else {
                  const err31 = { instancePath: instancePath + "/queueBinding/messageId", schemaPath: "#/definitions/BrowserQueueBinding/properties/messageId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err31];
                  } else {
                    vErrors.push(err31);
                  }
                  errors++;
                }
              }
              if (data8.queueRevision !== void 0) {
                let data10 = data8.queueRevision;
                if (!(typeof data10 == "number" && (!(data10 % 1) && !isNaN(data10)) && isFinite(data10))) {
                  const err32 = { instancePath: instancePath + "/queueBinding/queueRevision", schemaPath: "#/definitions/BrowserQueueBinding/properties/queueRevision/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                  if (vErrors === null) {
                    vErrors = [err32];
                  } else {
                    vErrors.push(err32);
                  }
                  errors++;
                }
                if (typeof data10 == "number" && isFinite(data10)) {
                  if (data10 > 9007199254740991 || isNaN(data10)) {
                    const err33 = { instancePath: instancePath + "/queueBinding/queueRevision", schemaPath: "#/definitions/BrowserQueueBinding/properties/queueRevision/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                    if (vErrors === null) {
                      vErrors = [err33];
                    } else {
                      vErrors.push(err33);
                    }
                    errors++;
                  }
                  if (data10 < 0 || isNaN(data10)) {
                    const err34 = { instancePath: instancePath + "/queueBinding/queueRevision", schemaPath: "#/definitions/BrowserQueueBinding/properties/queueRevision/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                    if (vErrors === null) {
                      vErrors = [err34];
                    } else {
                      vErrors.push(err34);
                    }
                    errors++;
                  }
                }
              }
            } else {
              const err35 = { instancePath: instancePath + "/queueBinding", schemaPath: "#/definitions/BrowserQueueBinding/type", keyword: "type", params: { type: "object" }, message: "must be object" };
              if (vErrors === null) {
                vErrors = [err35];
              } else {
                vErrors.push(err35);
              }
              errors++;
            }
          }
        } else {
          const err36 = { instancePath, schemaPath: "#/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
          if (vErrors === null) {
            vErrors = [err36];
          } else {
            vErrors.push(err36);
          }
          errors++;
        }
        var _valid0 = _errs12 === errors;
        valid0 = valid0 || _valid0;
        if (!valid0) {
          const _errs31 = errors;
          if (data && typeof data == "object" && !Array.isArray(data)) {
            if (data.kind === void 0) {
              const err37 = { instancePath, schemaPath: "#/anyOf/2/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
              if (vErrors === null) {
                vErrors = [err37];
              } else {
                vErrors.push(err37);
              }
              errors++;
            }
            if (data.inputId === void 0) {
              const err38 = { instancePath, schemaPath: "#/anyOf/2/required", keyword: "required", params: { missingProperty: "inputId" }, message: "must have required property 'inputId'" };
              if (vErrors === null) {
                vErrors = [err38];
              } else {
                vErrors.push(err38);
              }
              errors++;
            }
            if (data.runId === void 0) {
              const err39 = { instancePath, schemaPath: "#/anyOf/2/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
              if (vErrors === null) {
                vErrors = [err39];
              } else {
                vErrors.push(err39);
              }
              errors++;
            }
            for (const key3 in data) {
              if (!(key3 === "kind" || key3 === "inputId" || key3 === "runId")) {
                const err40 = { instancePath, schemaPath: "#/anyOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err40];
                } else {
                  vErrors.push(err40);
                }
                errors++;
              }
            }
            if (data.kind !== void 0) {
              let data11 = data.kind;
              if (typeof data11 !== "string") {
                const err41 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/2/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err41];
                } else {
                  vErrors.push(err41);
                }
                errors++;
              }
              if ("interrupt" !== data11) {
                const err42 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/2/properties/kind/const", keyword: "const", params: { allowedValue: "interrupt" }, message: "must be equal to constant" };
                if (vErrors === null) {
                  vErrors = [err42];
                } else {
                  vErrors.push(err42);
                }
                errors++;
              }
            }
            if (data.inputId !== void 0) {
              let data12 = data.inputId;
              if (typeof data12 === "string") {
                if (!pattern0.test(data12)) {
                  const err43 = { instancePath: instancePath + "/inputId", schemaPath: "#/anyOf/2/properties/inputId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                  if (vErrors === null) {
                    vErrors = [err43];
                  } else {
                    vErrors.push(err43);
                  }
                  errors++;
                }
              } else {
                const err44 = { instancePath: instancePath + "/inputId", schemaPath: "#/anyOf/2/properties/inputId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err44];
                } else {
                  vErrors.push(err44);
                }
                errors++;
              }
            }
            if (data.runId !== void 0) {
              let data13 = data.runId;
              if (typeof data13 === "string") {
                if (!pattern0.test(data13)) {
                  const err45 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/2/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                  if (vErrors === null) {
                    vErrors = [err45];
                  } else {
                    vErrors.push(err45);
                  }
                  errors++;
                }
              } else {
                const err46 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/2/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err46];
                } else {
                  vErrors.push(err46);
                }
                errors++;
              }
            }
          } else {
            const err47 = { instancePath, schemaPath: "#/anyOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err47];
            } else {
              vErrors.push(err47);
            }
            errors++;
          }
          var _valid0 = _errs31 === errors;
          valid0 = valid0 || _valid0;
          if (!valid0) {
            const _errs40 = errors;
            if (data && typeof data == "object" && !Array.isArray(data)) {
              if (data.kind === void 0) {
                const err48 = { instancePath, schemaPath: "#/anyOf/3/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                if (vErrors === null) {
                  vErrors = [err48];
                } else {
                  vErrors.push(err48);
                }
                errors++;
              }
              if (data.inputId === void 0) {
                const err49 = { instancePath, schemaPath: "#/anyOf/3/required", keyword: "required", params: { missingProperty: "inputId" }, message: "must have required property 'inputId'" };
                if (vErrors === null) {
                  vErrors = [err49];
                } else {
                  vErrors.push(err49);
                }
                errors++;
              }
              if (data.runId === void 0) {
                const err50 = { instancePath, schemaPath: "#/anyOf/3/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
                if (vErrors === null) {
                  vErrors = [err50];
                } else {
                  vErrors.push(err50);
                }
                errors++;
              }
              if (data.requestId === void 0) {
                const err51 = { instancePath, schemaPath: "#/anyOf/3/required", keyword: "required", params: { missingProperty: "requestId" }, message: "must have required property 'requestId'" };
                if (vErrors === null) {
                  vErrors = [err51];
                } else {
                  vErrors.push(err51);
                }
                errors++;
              }
              if (data.response === void 0) {
                const err52 = { instancePath, schemaPath: "#/anyOf/3/required", keyword: "required", params: { missingProperty: "response" }, message: "must have required property 'response'" };
                if (vErrors === null) {
                  vErrors = [err52];
                } else {
                  vErrors.push(err52);
                }
                errors++;
              }
              for (const key4 in data) {
                if (!(key4 === "kind" || key4 === "inputId" || key4 === "runId" || key4 === "requestId" || key4 === "response")) {
                  const err53 = { instancePath, schemaPath: "#/anyOf/3/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key4 }, message: "must NOT have additional properties" };
                  if (vErrors === null) {
                    vErrors = [err53];
                  } else {
                    vErrors.push(err53);
                  }
                  errors++;
                }
              }
              if (data.kind !== void 0) {
                let data14 = data.kind;
                if (typeof data14 !== "string") {
                  const err54 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/3/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err54];
                  } else {
                    vErrors.push(err54);
                  }
                  errors++;
                }
                if ("respond" !== data14) {
                  const err55 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/3/properties/kind/const", keyword: "const", params: { allowedValue: "respond" }, message: "must be equal to constant" };
                  if (vErrors === null) {
                    vErrors = [err55];
                  } else {
                    vErrors.push(err55);
                  }
                  errors++;
                }
              }
              if (data.inputId !== void 0) {
                let data15 = data.inputId;
                if (typeof data15 === "string") {
                  if (!pattern0.test(data15)) {
                    const err56 = { instancePath: instancePath + "/inputId", schemaPath: "#/anyOf/3/properties/inputId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                    if (vErrors === null) {
                      vErrors = [err56];
                    } else {
                      vErrors.push(err56);
                    }
                    errors++;
                  }
                } else {
                  const err57 = { instancePath: instancePath + "/inputId", schemaPath: "#/anyOf/3/properties/inputId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err57];
                  } else {
                    vErrors.push(err57);
                  }
                  errors++;
                }
              }
              if (data.runId !== void 0) {
                let data16 = data.runId;
                if (typeof data16 === "string") {
                  if (!pattern0.test(data16)) {
                    const err58 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/3/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                    if (vErrors === null) {
                      vErrors = [err58];
                    } else {
                      vErrors.push(err58);
                    }
                    errors++;
                  }
                } else {
                  const err59 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/3/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err59];
                  } else {
                    vErrors.push(err59);
                  }
                  errors++;
                }
              }
              if (data.requestId !== void 0) {
                let data17 = data.requestId;
                if (typeof data17 === "string") {
                  if (!pattern0.test(data17)) {
                    const err60 = { instancePath: instancePath + "/requestId", schemaPath: "#/anyOf/3/properties/requestId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                    if (vErrors === null) {
                      vErrors = [err60];
                    } else {
                      vErrors.push(err60);
                    }
                    errors++;
                  }
                } else {
                  const err61 = { instancePath: instancePath + "/requestId", schemaPath: "#/anyOf/3/properties/requestId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err61];
                  } else {
                    vErrors.push(err61);
                  }
                  errors++;
                }
              }
              if (data.response !== void 0) {
                if (!validate13(data.response, { instancePath: instancePath + "/response", parentData: data, parentDataProperty: "response", rootData })) {
                  vErrors = vErrors === null ? validate13.errors : vErrors.concat(validate13.errors);
                  errors = vErrors.length;
                }
              }
            } else {
              const err62 = { instancePath, schemaPath: "#/anyOf/3/type", keyword: "type", params: { type: "object" }, message: "must be object" };
              if (vErrors === null) {
                vErrors = [err62];
              } else {
                vErrors.push(err62);
              }
              errors++;
            }
            var _valid0 = _errs40 === errors;
            valid0 = valid0 || _valid0;
            if (!valid0) {
              const _errs52 = errors;
              if (data && typeof data == "object" && !Array.isArray(data)) {
                if (data.kind === void 0) {
                  const err63 = { instancePath, schemaPath: "#/anyOf/4/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                  if (vErrors === null) {
                    vErrors = [err63];
                  } else {
                    vErrors.push(err63);
                  }
                  errors++;
                }
                if (data.inputId === void 0) {
                  const err64 = { instancePath, schemaPath: "#/anyOf/4/required", keyword: "required", params: { missingProperty: "inputId" }, message: "must have required property 'inputId'" };
                  if (vErrors === null) {
                    vErrors = [err64];
                  } else {
                    vErrors.push(err64);
                  }
                  errors++;
                }
                if (data.runId === void 0) {
                  const err65 = { instancePath, schemaPath: "#/anyOf/4/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
                  if (vErrors === null) {
                    vErrors = [err65];
                  } else {
                    vErrors.push(err65);
                  }
                  errors++;
                }
                if (data.commitRevision === void 0) {
                  const err66 = { instancePath, schemaPath: "#/anyOf/4/required", keyword: "required", params: { missingProperty: "commitRevision" }, message: "must have required property 'commitRevision'" };
                  if (vErrors === null) {
                    vErrors = [err66];
                  } else {
                    vErrors.push(err66);
                  }
                  errors++;
                }
                for (const key5 in data) {
                  if (!(key5 === "kind" || key5 === "inputId" || key5 === "runId" || key5 === "commitRevision" || key5 === "content" || key5 === "acknowledgeUnknownEffects")) {
                    const err67 = { instancePath, schemaPath: "#/anyOf/4/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key5 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err67];
                    } else {
                      vErrors.push(err67);
                    }
                    errors++;
                  }
                }
                if (data.kind !== void 0) {
                  let data19 = data.kind;
                  if (typeof data19 !== "string") {
                    const err68 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/4/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err68];
                    } else {
                      vErrors.push(err68);
                    }
                    errors++;
                  }
                  if ("resume" !== data19) {
                    const err69 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/4/properties/kind/const", keyword: "const", params: { allowedValue: "resume" }, message: "must be equal to constant" };
                    if (vErrors === null) {
                      vErrors = [err69];
                    } else {
                      vErrors.push(err69);
                    }
                    errors++;
                  }
                }
                if (data.inputId !== void 0) {
                  let data20 = data.inputId;
                  if (typeof data20 === "string") {
                    if (!pattern0.test(data20)) {
                      const err70 = { instancePath: instancePath + "/inputId", schemaPath: "#/anyOf/4/properties/inputId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err70];
                      } else {
                        vErrors.push(err70);
                      }
                      errors++;
                    }
                  } else {
                    const err71 = { instancePath: instancePath + "/inputId", schemaPath: "#/anyOf/4/properties/inputId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err71];
                    } else {
                      vErrors.push(err71);
                    }
                    errors++;
                  }
                }
                if (data.runId !== void 0) {
                  let data21 = data.runId;
                  if (typeof data21 === "string") {
                    if (!pattern0.test(data21)) {
                      const err72 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/4/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err72];
                      } else {
                        vErrors.push(err72);
                      }
                      errors++;
                    }
                  } else {
                    const err73 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/4/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err73];
                    } else {
                      vErrors.push(err73);
                    }
                    errors++;
                  }
                }
                if (data.commitRevision !== void 0) {
                  let data22 = data.commitRevision;
                  if (!(typeof data22 == "number" && (!(data22 % 1) && !isNaN(data22)) && isFinite(data22))) {
                    const err74 = { instancePath: instancePath + "/commitRevision", schemaPath: "#/anyOf/4/properties/commitRevision/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                    if (vErrors === null) {
                      vErrors = [err74];
                    } else {
                      vErrors.push(err74);
                    }
                    errors++;
                  }
                  if (typeof data22 == "number" && isFinite(data22)) {
                    if (data22 > 9007199254740991 || isNaN(data22)) {
                      const err75 = { instancePath: instancePath + "/commitRevision", schemaPath: "#/anyOf/4/properties/commitRevision/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                      if (vErrors === null) {
                        vErrors = [err75];
                      } else {
                        vErrors.push(err75);
                      }
                      errors++;
                    }
                    if (data22 < 0 || isNaN(data22)) {
                      const err76 = { instancePath: instancePath + "/commitRevision", schemaPath: "#/anyOf/4/properties/commitRevision/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                      if (vErrors === null) {
                        vErrors = [err76];
                      } else {
                        vErrors.push(err76);
                      }
                      errors++;
                    }
                  }
                }
                if (data.content !== void 0) {
                  let data23 = data.content;
                  if (typeof data23 === "string") {
                    if (!pattern0.test(data23)) {
                      const err77 = { instancePath: instancePath + "/content", schemaPath: "#/anyOf/4/properties/content/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err77];
                      } else {
                        vErrors.push(err77);
                      }
                      errors++;
                    }
                  } else {
                    const err78 = { instancePath: instancePath + "/content", schemaPath: "#/anyOf/4/properties/content/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err78];
                    } else {
                      vErrors.push(err78);
                    }
                    errors++;
                  }
                }
                if (data.acknowledgeUnknownEffects !== void 0) {
                  if (typeof data.acknowledgeUnknownEffects !== "boolean") {
                    const err79 = { instancePath: instancePath + "/acknowledgeUnknownEffects", schemaPath: "#/anyOf/4/properties/acknowledgeUnknownEffects/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                    if (vErrors === null) {
                      vErrors = [err79];
                    } else {
                      vErrors.push(err79);
                    }
                    errors++;
                  }
                }
              } else {
                const err80 = { instancePath, schemaPath: "#/anyOf/4/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err80];
                } else {
                  vErrors.push(err80);
                }
                errors++;
              }
              var _valid0 = _errs52 === errors;
              valid0 = valid0 || _valid0;
              if (!valid0) {
                const _errs67 = errors;
                if (data && typeof data == "object" && !Array.isArray(data)) {
                  if (data.kind === void 0) {
                    const err81 = { instancePath, schemaPath: "#/anyOf/5/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                    if (vErrors === null) {
                      vErrors = [err81];
                    } else {
                      vErrors.push(err81);
                    }
                    errors++;
                  }
                  if (data.inputId === void 0) {
                    const err82 = { instancePath, schemaPath: "#/anyOf/5/required", keyword: "required", params: { missingProperty: "inputId" }, message: "must have required property 'inputId'" };
                    if (vErrors === null) {
                      vErrors = [err82];
                    } else {
                      vErrors.push(err82);
                    }
                    errors++;
                  }
                  if (data.action === void 0) {
                    const err83 = { instancePath, schemaPath: "#/anyOf/5/required", keyword: "required", params: { missingProperty: "action" }, message: "must have required property 'action'" };
                    if (vErrors === null) {
                      vErrors = [err83];
                    } else {
                      vErrors.push(err83);
                    }
                    errors++;
                  }
                  if (data.queueRevision === void 0) {
                    const err84 = { instancePath, schemaPath: "#/anyOf/5/required", keyword: "required", params: { missingProperty: "queueRevision" }, message: "must have required property 'queueRevision'" };
                    if (vErrors === null) {
                      vErrors = [err84];
                    } else {
                      vErrors.push(err84);
                    }
                    errors++;
                  }
                  for (const key6 in data) {
                    if (!(key6 === "kind" || key6 === "inputId" || key6 === "action" || key6 === "queueRevision" || key6 === "messageId")) {
                      const err85 = { instancePath, schemaPath: "#/anyOf/5/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key6 }, message: "must NOT have additional properties" };
                      if (vErrors === null) {
                        vErrors = [err85];
                      } else {
                        vErrors.push(err85);
                      }
                      errors++;
                    }
                  }
                  if (data.kind !== void 0) {
                    let data25 = data.kind;
                    if (typeof data25 !== "string") {
                      const err86 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/5/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err86];
                      } else {
                        vErrors.push(err86);
                      }
                      errors++;
                    }
                    if ("queue_control" !== data25) {
                      const err87 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/5/properties/kind/const", keyword: "const", params: { allowedValue: "queue_control" }, message: "must be equal to constant" };
                      if (vErrors === null) {
                        vErrors = [err87];
                      } else {
                        vErrors.push(err87);
                      }
                      errors++;
                    }
                  }
                  if (data.inputId !== void 0) {
                    let data26 = data.inputId;
                    if (typeof data26 === "string") {
                      if (!pattern0.test(data26)) {
                        const err88 = { instancePath: instancePath + "/inputId", schemaPath: "#/anyOf/5/properties/inputId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                        if (vErrors === null) {
                          vErrors = [err88];
                        } else {
                          vErrors.push(err88);
                        }
                        errors++;
                      }
                    } else {
                      const err89 = { instancePath: instancePath + "/inputId", schemaPath: "#/anyOf/5/properties/inputId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err89];
                      } else {
                        vErrors.push(err89);
                      }
                      errors++;
                    }
                  }
                  if (data.action !== void 0) {
                    let data27 = data.action;
                    if (typeof data27 !== "string") {
                      const err90 = { instancePath: instancePath + "/action", schemaPath: "#/anyOf/5/properties/action/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err90];
                      } else {
                        vErrors.push(err90);
                      }
                      errors++;
                    }
                    if (!(data27 === "continue" || data27 === "clear" || data27 === "remove")) {
                      const err91 = { instancePath: instancePath + "/action", schemaPath: "#/anyOf/5/properties/action/enum", keyword: "enum", params: { allowedValues: schema13.anyOf[5].properties.action.enum }, message: "must be equal to one of the allowed values" };
                      if (vErrors === null) {
                        vErrors = [err91];
                      } else {
                        vErrors.push(err91);
                      }
                      errors++;
                    }
                  }
                  if (data.queueRevision !== void 0) {
                    let data28 = data.queueRevision;
                    if (!(typeof data28 == "number" && (!(data28 % 1) && !isNaN(data28)) && isFinite(data28))) {
                      const err92 = { instancePath: instancePath + "/queueRevision", schemaPath: "#/anyOf/5/properties/queueRevision/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                      if (vErrors === null) {
                        vErrors = [err92];
                      } else {
                        vErrors.push(err92);
                      }
                      errors++;
                    }
                    if (typeof data28 == "number" && isFinite(data28)) {
                      if (data28 > 9007199254740991 || isNaN(data28)) {
                        const err93 = { instancePath: instancePath + "/queueRevision", schemaPath: "#/anyOf/5/properties/queueRevision/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                        if (vErrors === null) {
                          vErrors = [err93];
                        } else {
                          vErrors.push(err93);
                        }
                        errors++;
                      }
                      if (data28 < 0 || isNaN(data28)) {
                        const err94 = { instancePath: instancePath + "/queueRevision", schemaPath: "#/anyOf/5/properties/queueRevision/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                        if (vErrors === null) {
                          vErrors = [err94];
                        } else {
                          vErrors.push(err94);
                        }
                        errors++;
                      }
                    }
                  }
                  if (data.messageId !== void 0) {
                    let data29 = data.messageId;
                    if (typeof data29 === "string") {
                      if (!pattern0.test(data29)) {
                        const err95 = { instancePath: instancePath + "/messageId", schemaPath: "#/anyOf/5/properties/messageId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                        if (vErrors === null) {
                          vErrors = [err95];
                        } else {
                          vErrors.push(err95);
                        }
                        errors++;
                      }
                    } else {
                      const err96 = { instancePath: instancePath + "/messageId", schemaPath: "#/anyOf/5/properties/messageId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err96];
                      } else {
                        vErrors.push(err96);
                      }
                      errors++;
                    }
                  }
                } else {
                  const err97 = { instancePath, schemaPath: "#/anyOf/5/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                  if (vErrors === null) {
                    vErrors = [err97];
                  } else {
                    vErrors.push(err97);
                  }
                  errors++;
                }
                var _valid0 = _errs67 === errors;
                valid0 = valid0 || _valid0;
              }
            }
          }
        }
      }
      if (!valid0) {
        const err98 = { instancePath, schemaPath: "#/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err98];
        } else {
          vErrors.push(err98);
        }
        errors++;
      } else {
        errors = _errs0;
        if (vErrors !== null) {
          if (_errs0) {
            vErrors.length = _errs0;
          } else {
            vErrors = null;
          }
        }
      }
      validate12.errors = vErrors;
      return errors === 0;
    }
    var wrapper0 = { validate: validate16 };
    function validate16(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      const _errs0 = errors;
      let valid0 = false;
      const _errs1 = errors;
      if (data !== null) {
        const err0 = { instancePath, schemaPath: "#/anyOf/0/type", keyword: "type", params: { type: "null" }, message: "must be null" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
        }
        errors++;
      }
      var _valid0 = _errs1 === errors;
      valid0 = valid0 || _valid0;
      if (!valid0) {
        const _errs3 = errors;
        if (typeof data !== "boolean") {
          const err1 = { instancePath, schemaPath: "#/anyOf/1/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        var _valid0 = _errs3 === errors;
        valid0 = valid0 || _valid0;
        if (!valid0) {
          const _errs5 = errors;
          if (!(typeof data == "number" && isFinite(data))) {
            const err2 = { instancePath, schemaPath: "#/anyOf/2/type", keyword: "type", params: { type: "number" }, message: "must be number" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
          var _valid0 = _errs5 === errors;
          valid0 = valid0 || _valid0;
          if (!valid0) {
            const _errs7 = errors;
            if (typeof data !== "string") {
              const err3 = { instancePath, schemaPath: "#/anyOf/3/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err3];
              } else {
                vErrors.push(err3);
              }
              errors++;
            }
            var _valid0 = _errs7 === errors;
            valid0 = valid0 || _valid0;
            if (!valid0) {
              const _errs9 = errors;
              if (Array.isArray(data)) {
                const len0 = data.length;
                for (let i0 = 0; i0 < len0; i0++) {
                  if (!wrapper0.validate(data[i0], { instancePath: instancePath + "/" + i0, parentData: data, parentDataProperty: i0, rootData })) {
                    vErrors = vErrors === null ? wrapper0.validate.errors : vErrors.concat(wrapper0.validate.errors);
                    errors = vErrors.length;
                  }
                }
              } else {
                const err4 = { instancePath, schemaPath: "#/anyOf/4/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                if (vErrors === null) {
                  vErrors = [err4];
                } else {
                  vErrors.push(err4);
                }
                errors++;
              }
              var _valid0 = _errs9 === errors;
              valid0 = valid0 || _valid0;
              if (!valid0) {
                const _errs12 = errors;
                if (data && typeof data == "object" && !Array.isArray(data)) {
                  for (const key0 in data) {
                    if (!wrapper0.validate(data[key0], { instancePath: instancePath + "/" + key0.replace(/~/g, "~0").replace(/\//g, "~1"), parentData: data, parentDataProperty: key0, rootData })) {
                      vErrors = vErrors === null ? wrapper0.validate.errors : vErrors.concat(wrapper0.validate.errors);
                      errors = vErrors.length;
                    }
                  }
                } else {
                  const err5 = { instancePath, schemaPath: "#/anyOf/5/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                  if (vErrors === null) {
                    vErrors = [err5];
                  } else {
                    vErrors.push(err5);
                  }
                  errors++;
                }
                var _valid0 = _errs12 === errors;
                valid0 = valid0 || _valid0;
              }
            }
          }
        }
      }
      if (!valid0) {
        const err6 = { instancePath, schemaPath: "#/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
        }
        errors++;
      } else {
        errors = _errs0;
        if (vErrors !== null) {
          if (_errs0) {
            vErrors.length = _errs0;
          } else {
            vErrors = null;
          }
        }
      }
      validate16.errors = vErrors;
      return errors === 0;
    }
    function validate11(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      const _errs0 = errors;
      let valid0 = false;
      const _errs1 = errors;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.kind === void 0) {
          const err0 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.intentId === void 0) {
          const err1 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "intentId" }, message: "must have required property 'intentId'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.goalId === void 0) {
          const err2 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.inputId === void 0) {
          const err3 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "inputId" }, message: "must have required property 'inputId'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.intent === void 0) {
          const err4 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "intent" }, message: "must have required property 'intent'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "kind" || key0 === "intentId" || key0 === "goalId" || key0 === "inputId" || key0 === "intent" || key0 === "mode" || key0 === "modelId")) {
            const err5 = { instancePath, schemaPath: "#/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.kind !== void 0) {
          let data0 = data.kind;
          if (typeof data0 !== "string") {
            const err6 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/0/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
          if ("create_session" !== data0) {
            const err7 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/0/properties/kind/const", keyword: "const", params: { allowedValue: "create_session" }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
        if (data.intentId !== void 0) {
          let data1 = data.intentId;
          if (typeof data1 === "string") {
            if (!pattern0.test(data1)) {
              const err8 = { instancePath: instancePath + "/intentId", schemaPath: "#/anyOf/0/properties/intentId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err8];
              } else {
                vErrors.push(err8);
              }
              errors++;
            }
          } else {
            const err9 = { instancePath: instancePath + "/intentId", schemaPath: "#/anyOf/0/properties/intentId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
        }
        if (data.goalId !== void 0) {
          let data2 = data.goalId;
          if (typeof data2 === "string") {
            if (!pattern0.test(data2)) {
              const err10 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/0/properties/goalId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
          } else {
            const err11 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/0/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
        }
        if (data.inputId !== void 0) {
          let data3 = data.inputId;
          if (typeof data3 === "string") {
            if (!pattern0.test(data3)) {
              const err12 = { instancePath: instancePath + "/inputId", schemaPath: "#/anyOf/0/properties/inputId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
          } else {
            const err13 = { instancePath: instancePath + "/inputId", schemaPath: "#/anyOf/0/properties/inputId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
        }
        if (data.intent !== void 0) {
          if (typeof data.intent !== "string") {
            const err14 = { instancePath: instancePath + "/intent", schemaPath: "#/anyOf/0/properties/intent/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
        }
        if (data.mode !== void 0) {
          let data5 = data.mode;
          if (typeof data5 !== "string") {
            const err15 = { instancePath: instancePath + "/mode", schemaPath: "#/anyOf/0/properties/mode/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
          if ("plan" !== data5) {
            const err16 = { instancePath: instancePath + "/mode", schemaPath: "#/anyOf/0/properties/mode/const", keyword: "const", params: { allowedValue: "plan" }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err16];
            } else {
              vErrors.push(err16);
            }
            errors++;
          }
        }
        if (data.modelId !== void 0) {
          let data6 = data.modelId;
          if (typeof data6 === "string") {
            if (!pattern0.test(data6)) {
              const err17 = { instancePath: instancePath + "/modelId", schemaPath: "#/anyOf/0/properties/modelId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err17];
              } else {
                vErrors.push(err17);
              }
              errors++;
            }
          } else {
            const err18 = { instancePath: instancePath + "/modelId", schemaPath: "#/anyOf/0/properties/modelId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err18];
            } else {
              vErrors.push(err18);
            }
            errors++;
          }
        }
      } else {
        const err19 = { instancePath, schemaPath: "#/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err19];
        } else {
          vErrors.push(err19);
        }
        errors++;
      }
      var _valid0 = _errs1 === errors;
      valid0 = valid0 || _valid0;
      if (!valid0) {
        const _errs18 = errors;
        if (data && typeof data == "object" && !Array.isArray(data)) {
          if (data.kind === void 0) {
            const err20 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
            if (vErrors === null) {
              vErrors = [err20];
            } else {
              vErrors.push(err20);
            }
            errors++;
          }
          if (data.intentId === void 0) {
            const err21 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "intentId" }, message: "must have required property 'intentId'" };
            if (vErrors === null) {
              vErrors = [err21];
            } else {
              vErrors.push(err21);
            }
            errors++;
          }
          if (data.goalId === void 0) {
            const err22 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
            if (vErrors === null) {
              vErrors = [err22];
            } else {
              vErrors.push(err22);
            }
            errors++;
          }
          if (data.input === void 0) {
            const err23 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "input" }, message: "must have required property 'input'" };
            if (vErrors === null) {
              vErrors = [err23];
            } else {
              vErrors.push(err23);
            }
            errors++;
          }
          for (const key1 in data) {
            if (!(key1 === "kind" || key1 === "intentId" || key1 === "goalId" || key1 === "input")) {
              const err24 = { instancePath, schemaPath: "#/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
              if (vErrors === null) {
                vErrors = [err24];
              } else {
                vErrors.push(err24);
              }
              errors++;
            }
          }
          if (data.kind !== void 0) {
            let data7 = data.kind;
            if (typeof data7 !== "string") {
              const err25 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/1/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err25];
              } else {
                vErrors.push(err25);
              }
              errors++;
            }
            if ("session_input" !== data7) {
              const err26 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/1/properties/kind/const", keyword: "const", params: { allowedValue: "session_input" }, message: "must be equal to constant" };
              if (vErrors === null) {
                vErrors = [err26];
              } else {
                vErrors.push(err26);
              }
              errors++;
            }
          }
          if (data.intentId !== void 0) {
            let data8 = data.intentId;
            if (typeof data8 === "string") {
              if (!pattern0.test(data8)) {
                const err27 = { instancePath: instancePath + "/intentId", schemaPath: "#/anyOf/1/properties/intentId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                if (vErrors === null) {
                  vErrors = [err27];
                } else {
                  vErrors.push(err27);
                }
                errors++;
              }
            } else {
              const err28 = { instancePath: instancePath + "/intentId", schemaPath: "#/anyOf/1/properties/intentId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err28];
              } else {
                vErrors.push(err28);
              }
              errors++;
            }
          }
          if (data.goalId !== void 0) {
            let data9 = data.goalId;
            if (typeof data9 === "string") {
              if (!pattern0.test(data9)) {
                const err29 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/1/properties/goalId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                if (vErrors === null) {
                  vErrors = [err29];
                } else {
                  vErrors.push(err29);
                }
                errors++;
              }
            } else {
              const err30 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/1/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err30];
              } else {
                vErrors.push(err30);
              }
              errors++;
            }
          }
          if (data.input !== void 0) {
            if (!validate12(data.input, { instancePath: instancePath + "/input", parentData: data, parentDataProperty: "input", rootData })) {
              vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
              errors = vErrors.length;
            }
          }
        } else {
          const err31 = { instancePath, schemaPath: "#/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
          if (vErrors === null) {
            vErrors = [err31];
          } else {
            vErrors.push(err31);
          }
          errors++;
        }
        var _valid0 = _errs18 === errors;
        valid0 = valid0 || _valid0;
        if (!valid0) {
          const _errs28 = errors;
          if (data && typeof data == "object" && !Array.isArray(data)) {
            if (data.kind === void 0) {
              const err32 = { instancePath, schemaPath: "#/anyOf/2/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
              if (vErrors === null) {
                vErrors = [err32];
              } else {
                vErrors.push(err32);
              }
              errors++;
            }
            if (data.intentId === void 0) {
              const err33 = { instancePath, schemaPath: "#/anyOf/2/required", keyword: "required", params: { missingProperty: "intentId" }, message: "must have required property 'intentId'" };
              if (vErrors === null) {
                vErrors = [err33];
              } else {
                vErrors.push(err33);
              }
              errors++;
            }
            if (data.goalId === void 0) {
              const err34 = { instancePath, schemaPath: "#/anyOf/2/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
              if (vErrors === null) {
                vErrors = [err34];
              } else {
                vErrors.push(err34);
              }
              errors++;
            }
            if (data.runId === void 0) {
              const err35 = { instancePath, schemaPath: "#/anyOf/2/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
              if (vErrors === null) {
                vErrors = [err35];
              } else {
                vErrors.push(err35);
              }
              errors++;
            }
            for (const key2 in data) {
              if (!(key2 === "kind" || key2 === "intentId" || key2 === "goalId" || key2 === "runId")) {
                const err36 = { instancePath, schemaPath: "#/anyOf/2/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err36];
                } else {
                  vErrors.push(err36);
                }
                errors++;
              }
            }
            if (data.kind !== void 0) {
              let data11 = data.kind;
              if (typeof data11 !== "string") {
                const err37 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/2/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err37];
                } else {
                  vErrors.push(err37);
                }
                errors++;
              }
              if ("plan_mode" !== data11) {
                const err38 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/2/properties/kind/const", keyword: "const", params: { allowedValue: "plan_mode" }, message: "must be equal to constant" };
                if (vErrors === null) {
                  vErrors = [err38];
                } else {
                  vErrors.push(err38);
                }
                errors++;
              }
            }
            if (data.intentId !== void 0) {
              let data12 = data.intentId;
              if (typeof data12 === "string") {
                if (!pattern0.test(data12)) {
                  const err39 = { instancePath: instancePath + "/intentId", schemaPath: "#/anyOf/2/properties/intentId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                  if (vErrors === null) {
                    vErrors = [err39];
                  } else {
                    vErrors.push(err39);
                  }
                  errors++;
                }
              } else {
                const err40 = { instancePath: instancePath + "/intentId", schemaPath: "#/anyOf/2/properties/intentId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err40];
                } else {
                  vErrors.push(err40);
                }
                errors++;
              }
            }
            if (data.goalId !== void 0) {
              let data13 = data.goalId;
              if (typeof data13 === "string") {
                if (!pattern0.test(data13)) {
                  const err41 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/2/properties/goalId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                  if (vErrors === null) {
                    vErrors = [err41];
                  } else {
                    vErrors.push(err41);
                  }
                  errors++;
                }
              } else {
                const err42 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/2/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err42];
                } else {
                  vErrors.push(err42);
                }
                errors++;
              }
            }
            if (data.runId !== void 0) {
              let data14 = data.runId;
              if (typeof data14 === "string") {
                if (!pattern0.test(data14)) {
                  const err43 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/2/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                  if (vErrors === null) {
                    vErrors = [err43];
                  } else {
                    vErrors.push(err43);
                  }
                  errors++;
                }
              } else {
                const err44 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/2/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err44];
                } else {
                  vErrors.push(err44);
                }
                errors++;
              }
            }
          } else {
            const err45 = { instancePath, schemaPath: "#/anyOf/2/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err45];
            } else {
              vErrors.push(err45);
            }
            errors++;
          }
          var _valid0 = _errs28 === errors;
          valid0 = valid0 || _valid0;
          if (!valid0) {
            const _errs39 = errors;
            if (data && typeof data == "object" && !Array.isArray(data)) {
              if (data.kind === void 0) {
                const err46 = { instancePath, schemaPath: "#/anyOf/3/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                if (vErrors === null) {
                  vErrors = [err46];
                } else {
                  vErrors.push(err46);
                }
                errors++;
              }
              if (data.intentId === void 0) {
                const err47 = { instancePath, schemaPath: "#/anyOf/3/required", keyword: "required", params: { missingProperty: "intentId" }, message: "must have required property 'intentId'" };
                if (vErrors === null) {
                  vErrors = [err47];
                } else {
                  vErrors.push(err47);
                }
                errors++;
              }
              if (data.goalId === void 0) {
                const err48 = { instancePath, schemaPath: "#/anyOf/3/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
                if (vErrors === null) {
                  vErrors = [err48];
                } else {
                  vErrors.push(err48);
                }
                errors++;
              }
              if (data.runId === void 0) {
                const err49 = { instancePath, schemaPath: "#/anyOf/3/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
                if (vErrors === null) {
                  vErrors = [err49];
                } else {
                  vErrors.push(err49);
                }
                errors++;
              }
              if (data.modelId === void 0) {
                const err50 = { instancePath, schemaPath: "#/anyOf/3/required", keyword: "required", params: { missingProperty: "modelId" }, message: "must have required property 'modelId'" };
                if (vErrors === null) {
                  vErrors = [err50];
                } else {
                  vErrors.push(err50);
                }
                errors++;
              }
              if (data.persistAsDefault === void 0) {
                const err51 = { instancePath, schemaPath: "#/anyOf/3/required", keyword: "required", params: { missingProperty: "persistAsDefault" }, message: "must have required property 'persistAsDefault'" };
                if (vErrors === null) {
                  vErrors = [err51];
                } else {
                  vErrors.push(err51);
                }
                errors++;
              }
              for (const key3 in data) {
                if (!(key3 === "kind" || key3 === "intentId" || key3 === "goalId" || key3 === "runId" || key3 === "modelId" || key3 === "providerProfileId" || key3 === "persistAsDefault")) {
                  const err52 = { instancePath, schemaPath: "#/anyOf/3/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
                  if (vErrors === null) {
                    vErrors = [err52];
                  } else {
                    vErrors.push(err52);
                  }
                  errors++;
                }
              }
              if (data.kind !== void 0) {
                let data15 = data.kind;
                if (typeof data15 !== "string") {
                  const err53 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/3/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err53];
                  } else {
                    vErrors.push(err53);
                  }
                  errors++;
                }
                if ("model_selection" !== data15) {
                  const err54 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/3/properties/kind/const", keyword: "const", params: { allowedValue: "model_selection" }, message: "must be equal to constant" };
                  if (vErrors === null) {
                    vErrors = [err54];
                  } else {
                    vErrors.push(err54);
                  }
                  errors++;
                }
              }
              if (data.intentId !== void 0) {
                let data16 = data.intentId;
                if (typeof data16 === "string") {
                  if (!pattern0.test(data16)) {
                    const err55 = { instancePath: instancePath + "/intentId", schemaPath: "#/anyOf/3/properties/intentId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                    if (vErrors === null) {
                      vErrors = [err55];
                    } else {
                      vErrors.push(err55);
                    }
                    errors++;
                  }
                } else {
                  const err56 = { instancePath: instancePath + "/intentId", schemaPath: "#/anyOf/3/properties/intentId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err56];
                  } else {
                    vErrors.push(err56);
                  }
                  errors++;
                }
              }
              if (data.goalId !== void 0) {
                let data17 = data.goalId;
                if (typeof data17 === "string") {
                  if (!pattern0.test(data17)) {
                    const err57 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/3/properties/goalId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                    if (vErrors === null) {
                      vErrors = [err57];
                    } else {
                      vErrors.push(err57);
                    }
                    errors++;
                  }
                } else {
                  const err58 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/3/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err58];
                  } else {
                    vErrors.push(err58);
                  }
                  errors++;
                }
              }
              if (data.runId !== void 0) {
                let data18 = data.runId;
                if (typeof data18 === "string") {
                  if (!pattern0.test(data18)) {
                    const err59 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/3/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                    if (vErrors === null) {
                      vErrors = [err59];
                    } else {
                      vErrors.push(err59);
                    }
                    errors++;
                  }
                } else {
                  const err60 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/3/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err60];
                  } else {
                    vErrors.push(err60);
                  }
                  errors++;
                }
              }
              if (data.modelId !== void 0) {
                let data19 = data.modelId;
                if (typeof data19 === "string") {
                  if (!pattern0.test(data19)) {
                    const err61 = { instancePath: instancePath + "/modelId", schemaPath: "#/anyOf/3/properties/modelId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                    if (vErrors === null) {
                      vErrors = [err61];
                    } else {
                      vErrors.push(err61);
                    }
                    errors++;
                  }
                } else {
                  const err62 = { instancePath: instancePath + "/modelId", schemaPath: "#/anyOf/3/properties/modelId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err62];
                  } else {
                    vErrors.push(err62);
                  }
                  errors++;
                }
              }
              if (data.providerProfileId !== void 0) {
                let data20 = data.providerProfileId;
                if (typeof data20 === "string") {
                  if (!pattern0.test(data20)) {
                    const err63 = { instancePath: instancePath + "/providerProfileId", schemaPath: "#/anyOf/3/properties/providerProfileId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                    if (vErrors === null) {
                      vErrors = [err63];
                    } else {
                      vErrors.push(err63);
                    }
                    errors++;
                  }
                } else {
                  const err64 = { instancePath: instancePath + "/providerProfileId", schemaPath: "#/anyOf/3/properties/providerProfileId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err64];
                  } else {
                    vErrors.push(err64);
                  }
                  errors++;
                }
              }
              if (data.persistAsDefault !== void 0) {
                if (typeof data.persistAsDefault !== "boolean") {
                  const err65 = { instancePath: instancePath + "/persistAsDefault", schemaPath: "#/anyOf/3/properties/persistAsDefault/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                  if (vErrors === null) {
                    vErrors = [err65];
                  } else {
                    vErrors.push(err65);
                  }
                  errors++;
                }
              }
            } else {
              const err66 = { instancePath, schemaPath: "#/anyOf/3/type", keyword: "type", params: { type: "object" }, message: "must be object" };
              if (vErrors === null) {
                vErrors = [err66];
              } else {
                vErrors.push(err66);
              }
              errors++;
            }
            var _valid0 = _errs39 === errors;
            valid0 = valid0 || _valid0;
            if (!valid0) {
              const _errs56 = errors;
              if (data && typeof data == "object" && !Array.isArray(data)) {
                if (data.kind === void 0) {
                  const err67 = { instancePath, schemaPath: "#/anyOf/4/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                  if (vErrors === null) {
                    vErrors = [err67];
                  } else {
                    vErrors.push(err67);
                  }
                  errors++;
                }
                if (data.intentId === void 0) {
                  const err68 = { instancePath, schemaPath: "#/anyOf/4/required", keyword: "required", params: { missingProperty: "intentId" }, message: "must have required property 'intentId'" };
                  if (vErrors === null) {
                    vErrors = [err68];
                  } else {
                    vErrors.push(err68);
                  }
                  errors++;
                }
                if (data.profile === void 0) {
                  const err69 = { instancePath, schemaPath: "#/anyOf/4/required", keyword: "required", params: { missingProperty: "profile" }, message: "must have required property 'profile'" };
                  if (vErrors === null) {
                    vErrors = [err69];
                  } else {
                    vErrors.push(err69);
                  }
                  errors++;
                }
                if (data.expectedRevision === void 0) {
                  const err70 = { instancePath, schemaPath: "#/anyOf/4/required", keyword: "required", params: { missingProperty: "expectedRevision" }, message: "must have required property 'expectedRevision'" };
                  if (vErrors === null) {
                    vErrors = [err70];
                  } else {
                    vErrors.push(err70);
                  }
                  errors++;
                }
                for (const key4 in data) {
                  if (!(key4 === "kind" || key4 === "intentId" || key4 === "profile" || key4 === "expectedRevision")) {
                    const err71 = { instancePath, schemaPath: "#/anyOf/4/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key4 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err71];
                    } else {
                      vErrors.push(err71);
                    }
                    errors++;
                  }
                }
                if (data.kind !== void 0) {
                  let data22 = data.kind;
                  if (typeof data22 !== "string") {
                    const err72 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/4/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err72];
                    } else {
                      vErrors.push(err72);
                    }
                    errors++;
                  }
                  if ("permission_profile" !== data22) {
                    const err73 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/4/properties/kind/const", keyword: "const", params: { allowedValue: "permission_profile" }, message: "must be equal to constant" };
                    if (vErrors === null) {
                      vErrors = [err73];
                    } else {
                      vErrors.push(err73);
                    }
                    errors++;
                  }
                }
                if (data.intentId !== void 0) {
                  let data23 = data.intentId;
                  if (typeof data23 === "string") {
                    if (!pattern0.test(data23)) {
                      const err74 = { instancePath: instancePath + "/intentId", schemaPath: "#/anyOf/4/properties/intentId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err74];
                      } else {
                        vErrors.push(err74);
                      }
                      errors++;
                    }
                  } else {
                    const err75 = { instancePath: instancePath + "/intentId", schemaPath: "#/anyOf/4/properties/intentId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err75];
                    } else {
                      vErrors.push(err75);
                    }
                    errors++;
                  }
                }
                if (data.profile !== void 0) {
                  let data24 = data.profile;
                  if (data24 && typeof data24 == "object" && !Array.isArray(data24)) {
                    if (data24.sandbox === void 0) {
                      const err76 = { instancePath: instancePath + "/profile", schemaPath: "#/definitions/BrowserPermissionProfile/required", keyword: "required", params: { missingProperty: "sandbox" }, message: "must have required property 'sandbox'" };
                      if (vErrors === null) {
                        vErrors = [err76];
                      } else {
                        vErrors.push(err76);
                      }
                      errors++;
                    }
                    if (data24.approvals === void 0) {
                      const err77 = { instancePath: instancePath + "/profile", schemaPath: "#/definitions/BrowserPermissionProfile/required", keyword: "required", params: { missingProperty: "approvals" }, message: "must have required property 'approvals'" };
                      if (vErrors === null) {
                        vErrors = [err77];
                      } else {
                        vErrors.push(err77);
                      }
                      errors++;
                    }
                    if (data24.reviewer === void 0) {
                      const err78 = { instancePath: instancePath + "/profile", schemaPath: "#/definitions/BrowserPermissionProfile/required", keyword: "required", params: { missingProperty: "reviewer" }, message: "must have required property 'reviewer'" };
                      if (vErrors === null) {
                        vErrors = [err78];
                      } else {
                        vErrors.push(err78);
                      }
                      errors++;
                    }
                    if (data24.writableRoots === void 0) {
                      const err79 = { instancePath: instancePath + "/profile", schemaPath: "#/definitions/BrowserPermissionProfile/required", keyword: "required", params: { missingProperty: "writableRoots" }, message: "must have required property 'writableRoots'" };
                      if (vErrors === null) {
                        vErrors = [err79];
                      } else {
                        vErrors.push(err79);
                      }
                      errors++;
                    }
                    for (const key5 in data24) {
                      if (!(key5 === "sandbox" || key5 === "approvals" || key5 === "reviewer" || key5 === "writableRoots")) {
                        const err80 = { instancePath: instancePath + "/profile", schemaPath: "#/definitions/BrowserPermissionProfile/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key5 }, message: "must NOT have additional properties" };
                        if (vErrors === null) {
                          vErrors = [err80];
                        } else {
                          vErrors.push(err80);
                        }
                        errors++;
                      }
                    }
                    if (data24.sandbox !== void 0) {
                      let data25 = data24.sandbox;
                      if (typeof data25 !== "string") {
                        const err81 = { instancePath: instancePath + "/profile/sandbox", schemaPath: "#/definitions/BrowserPermissionProfile/properties/sandbox/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err81];
                        } else {
                          vErrors.push(err81);
                        }
                        errors++;
                      }
                      if (!(data25 === "read-only" || data25 === "workspace-write" || data25 === "danger-full-access")) {
                        const err82 = { instancePath: instancePath + "/profile/sandbox", schemaPath: "#/definitions/BrowserPermissionProfile/properties/sandbox/enum", keyword: "enum", params: { allowedValues: schema18.properties.sandbox.enum }, message: "must be equal to one of the allowed values" };
                        if (vErrors === null) {
                          vErrors = [err82];
                        } else {
                          vErrors.push(err82);
                        }
                        errors++;
                      }
                    }
                    if (data24.approvals !== void 0) {
                      let data26 = data24.approvals;
                      if (typeof data26 !== "string") {
                        const err83 = { instancePath: instancePath + "/profile/approvals", schemaPath: "#/definitions/BrowserPermissionProfile/properties/approvals/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err83];
                        } else {
                          vErrors.push(err83);
                        }
                        errors++;
                      }
                      if (!(data26 === "on-request" || data26 === "never")) {
                        const err84 = { instancePath: instancePath + "/profile/approvals", schemaPath: "#/definitions/BrowserPermissionProfile/properties/approvals/enum", keyword: "enum", params: { allowedValues: schema18.properties.approvals.enum }, message: "must be equal to one of the allowed values" };
                        if (vErrors === null) {
                          vErrors = [err84];
                        } else {
                          vErrors.push(err84);
                        }
                        errors++;
                      }
                    }
                    if (data24.reviewer !== void 0) {
                      let data27 = data24.reviewer;
                      if (typeof data27 !== "string") {
                        const err85 = { instancePath: instancePath + "/profile/reviewer", schemaPath: "#/definitions/BrowserPermissionProfile/properties/reviewer/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err85];
                        } else {
                          vErrors.push(err85);
                        }
                        errors++;
                      }
                      if (!(data27 === "user" || data27 === "auto_review")) {
                        const err86 = { instancePath: instancePath + "/profile/reviewer", schemaPath: "#/definitions/BrowserPermissionProfile/properties/reviewer/enum", keyword: "enum", params: { allowedValues: schema18.properties.reviewer.enum }, message: "must be equal to one of the allowed values" };
                        if (vErrors === null) {
                          vErrors = [err86];
                        } else {
                          vErrors.push(err86);
                        }
                        errors++;
                      }
                    }
                    if (data24.writableRoots !== void 0) {
                      let data28 = data24.writableRoots;
                      if (Array.isArray(data28)) {
                        const len0 = data28.length;
                        for (let i0 = 0; i0 < len0; i0++) {
                          if (typeof data28[i0] !== "string") {
                            const err87 = { instancePath: instancePath + "/profile/writableRoots/" + i0, schemaPath: "#/definitions/BrowserPermissionProfile/properties/writableRoots/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err87];
                            } else {
                              vErrors.push(err87);
                            }
                            errors++;
                          }
                        }
                      } else {
                        const err88 = { instancePath: instancePath + "/profile/writableRoots", schemaPath: "#/definitions/BrowserPermissionProfile/properties/writableRoots/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                        if (vErrors === null) {
                          vErrors = [err88];
                        } else {
                          vErrors.push(err88);
                        }
                        errors++;
                      }
                    }
                  } else {
                    const err89 = { instancePath: instancePath + "/profile", schemaPath: "#/definitions/BrowserPermissionProfile/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                    if (vErrors === null) {
                      vErrors = [err89];
                    } else {
                      vErrors.push(err89);
                    }
                    errors++;
                  }
                }
                if (data.expectedRevision !== void 0) {
                  let data30 = data.expectedRevision;
                  if (!(typeof data30 == "number" && (!(data30 % 1) && !isNaN(data30)) && isFinite(data30))) {
                    const err90 = { instancePath: instancePath + "/expectedRevision", schemaPath: "#/anyOf/4/properties/expectedRevision/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                    if (vErrors === null) {
                      vErrors = [err90];
                    } else {
                      vErrors.push(err90);
                    }
                    errors++;
                  }
                  if (typeof data30 == "number" && isFinite(data30)) {
                    if (data30 > 9007199254740991 || isNaN(data30)) {
                      const err91 = { instancePath: instancePath + "/expectedRevision", schemaPath: "#/anyOf/4/properties/expectedRevision/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                      if (vErrors === null) {
                        vErrors = [err91];
                      } else {
                        vErrors.push(err91);
                      }
                      errors++;
                    }
                    if (data30 < 0 || isNaN(data30)) {
                      const err92 = { instancePath: instancePath + "/expectedRevision", schemaPath: "#/anyOf/4/properties/expectedRevision/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                      if (vErrors === null) {
                        vErrors = [err92];
                      } else {
                        vErrors.push(err92);
                      }
                      errors++;
                    }
                  }
                }
              } else {
                const err93 = { instancePath, schemaPath: "#/anyOf/4/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err93];
                } else {
                  vErrors.push(err93);
                }
                errors++;
              }
              var _valid0 = _errs56 === errors;
              valid0 = valid0 || _valid0;
              if (!valid0) {
                const _errs79 = errors;
                if (data && typeof data == "object" && !Array.isArray(data)) {
                  if (data.kind === void 0) {
                    const err94 = { instancePath, schemaPath: "#/anyOf/5/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                    if (vErrors === null) {
                      vErrors = [err94];
                    } else {
                      vErrors.push(err94);
                    }
                    errors++;
                  }
                  if (data.intentId === void 0) {
                    const err95 = { instancePath, schemaPath: "#/anyOf/5/required", keyword: "required", params: { missingProperty: "intentId" }, message: "must have required property 'intentId'" };
                    if (vErrors === null) {
                      vErrors = [err95];
                    } else {
                      vErrors.push(err95);
                    }
                    errors++;
                  }
                  if (data.goalId === void 0) {
                    const err96 = { instancePath, schemaPath: "#/anyOf/5/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
                    if (vErrors === null) {
                      vErrors = [err96];
                    } else {
                      vErrors.push(err96);
                    }
                    errors++;
                  }
                  if (data.runId === void 0) {
                    const err97 = { instancePath, schemaPath: "#/anyOf/5/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
                    if (vErrors === null) {
                      vErrors = [err97];
                    } else {
                      vErrors.push(err97);
                    }
                    errors++;
                  }
                  if (data.exemptionId === void 0) {
                    const err98 = { instancePath, schemaPath: "#/anyOf/5/required", keyword: "required", params: { missingProperty: "exemptionId" }, message: "must have required property 'exemptionId'" };
                    if (vErrors === null) {
                      vErrors = [err98];
                    } else {
                      vErrors.push(err98);
                    }
                    errors++;
                  }
                  for (const key6 in data) {
                    if (!(key6 === "kind" || key6 === "intentId" || key6 === "goalId" || key6 === "runId" || key6 === "exemptionId")) {
                      const err99 = { instancePath, schemaPath: "#/anyOf/5/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key6 }, message: "must NOT have additional properties" };
                      if (vErrors === null) {
                        vErrors = [err99];
                      } else {
                        vErrors.push(err99);
                      }
                      errors++;
                    }
                  }
                  if (data.kind !== void 0) {
                    let data31 = data.kind;
                    if (typeof data31 !== "string") {
                      const err100 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/5/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err100];
                      } else {
                        vErrors.push(err100);
                      }
                      errors++;
                    }
                    if ("exemption_revoke" !== data31) {
                      const err101 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/5/properties/kind/const", keyword: "const", params: { allowedValue: "exemption_revoke" }, message: "must be equal to constant" };
                      if (vErrors === null) {
                        vErrors = [err101];
                      } else {
                        vErrors.push(err101);
                      }
                      errors++;
                    }
                  }
                  if (data.intentId !== void 0) {
                    let data32 = data.intentId;
                    if (typeof data32 === "string") {
                      if (!pattern0.test(data32)) {
                        const err102 = { instancePath: instancePath + "/intentId", schemaPath: "#/anyOf/5/properties/intentId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                        if (vErrors === null) {
                          vErrors = [err102];
                        } else {
                          vErrors.push(err102);
                        }
                        errors++;
                      }
                    } else {
                      const err103 = { instancePath: instancePath + "/intentId", schemaPath: "#/anyOf/5/properties/intentId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err103];
                      } else {
                        vErrors.push(err103);
                      }
                      errors++;
                    }
                  }
                  if (data.goalId !== void 0) {
                    let data33 = data.goalId;
                    if (typeof data33 === "string") {
                      if (!pattern0.test(data33)) {
                        const err104 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/5/properties/goalId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                        if (vErrors === null) {
                          vErrors = [err104];
                        } else {
                          vErrors.push(err104);
                        }
                        errors++;
                      }
                    } else {
                      const err105 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/5/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err105];
                      } else {
                        vErrors.push(err105);
                      }
                      errors++;
                    }
                  }
                  if (data.runId !== void 0) {
                    let data34 = data.runId;
                    if (typeof data34 === "string") {
                      if (!pattern0.test(data34)) {
                        const err106 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/5/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                        if (vErrors === null) {
                          vErrors = [err106];
                        } else {
                          vErrors.push(err106);
                        }
                        errors++;
                      }
                    } else {
                      const err107 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/5/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err107];
                      } else {
                        vErrors.push(err107);
                      }
                      errors++;
                    }
                  }
                  if (data.exemptionId !== void 0) {
                    let data35 = data.exemptionId;
                    if (typeof data35 === "string") {
                      if (!pattern0.test(data35)) {
                        const err108 = { instancePath: instancePath + "/exemptionId", schemaPath: "#/anyOf/5/properties/exemptionId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                        if (vErrors === null) {
                          vErrors = [err108];
                        } else {
                          vErrors.push(err108);
                        }
                        errors++;
                      }
                    } else {
                      const err109 = { instancePath: instancePath + "/exemptionId", schemaPath: "#/anyOf/5/properties/exemptionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err109];
                      } else {
                        vErrors.push(err109);
                      }
                      errors++;
                    }
                  }
                } else {
                  const err110 = { instancePath, schemaPath: "#/anyOf/5/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                  if (vErrors === null) {
                    vErrors = [err110];
                  } else {
                    vErrors.push(err110);
                  }
                  errors++;
                }
                var _valid0 = _errs79 === errors;
                valid0 = valid0 || _valid0;
                if (!valid0) {
                  const _errs92 = errors;
                  if (data && typeof data == "object" && !Array.isArray(data)) {
                    if (data.kind === void 0) {
                      const err111 = { instancePath, schemaPath: "#/anyOf/6/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                      if (vErrors === null) {
                        vErrors = [err111];
                      } else {
                        vErrors.push(err111);
                      }
                      errors++;
                    }
                    if (data.intentId === void 0) {
                      const err112 = { instancePath, schemaPath: "#/anyOf/6/required", keyword: "required", params: { missingProperty: "intentId" }, message: "must have required property 'intentId'" };
                      if (vErrors === null) {
                        vErrors = [err112];
                      } else {
                        vErrors.push(err112);
                      }
                      errors++;
                    }
                    if (data.goalId === void 0) {
                      const err113 = { instancePath, schemaPath: "#/anyOf/6/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
                      if (vErrors === null) {
                        vErrors = [err113];
                      } else {
                        vErrors.push(err113);
                      }
                      errors++;
                    }
                    if (data.archived === void 0) {
                      const err114 = { instancePath, schemaPath: "#/anyOf/6/required", keyword: "required", params: { missingProperty: "archived" }, message: "must have required property 'archived'" };
                      if (vErrors === null) {
                        vErrors = [err114];
                      } else {
                        vErrors.push(err114);
                      }
                      errors++;
                    }
                    for (const key7 in data) {
                      if (!(key7 === "kind" || key7 === "intentId" || key7 === "goalId" || key7 === "archived")) {
                        const err115 = { instancePath, schemaPath: "#/anyOf/6/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key7 }, message: "must NOT have additional properties" };
                        if (vErrors === null) {
                          vErrors = [err115];
                        } else {
                          vErrors.push(err115);
                        }
                        errors++;
                      }
                    }
                    if (data.kind !== void 0) {
                      let data36 = data.kind;
                      if (typeof data36 !== "string") {
                        const err116 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/6/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err116];
                        } else {
                          vErrors.push(err116);
                        }
                        errors++;
                      }
                      if ("goal_archive" !== data36) {
                        const err117 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/6/properties/kind/const", keyword: "const", params: { allowedValue: "goal_archive" }, message: "must be equal to constant" };
                        if (vErrors === null) {
                          vErrors = [err117];
                        } else {
                          vErrors.push(err117);
                        }
                        errors++;
                      }
                    }
                    if (data.intentId !== void 0) {
                      let data37 = data.intentId;
                      if (typeof data37 === "string") {
                        if (!pattern0.test(data37)) {
                          const err118 = { instancePath: instancePath + "/intentId", schemaPath: "#/anyOf/6/properties/intentId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                          if (vErrors === null) {
                            vErrors = [err118];
                          } else {
                            vErrors.push(err118);
                          }
                          errors++;
                        }
                      } else {
                        const err119 = { instancePath: instancePath + "/intentId", schemaPath: "#/anyOf/6/properties/intentId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err119];
                        } else {
                          vErrors.push(err119);
                        }
                        errors++;
                      }
                    }
                    if (data.goalId !== void 0) {
                      let data38 = data.goalId;
                      if (typeof data38 === "string") {
                        if (!pattern0.test(data38)) {
                          const err120 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/6/properties/goalId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                          if (vErrors === null) {
                            vErrors = [err120];
                          } else {
                            vErrors.push(err120);
                          }
                          errors++;
                        }
                      } else {
                        const err121 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/6/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err121];
                        } else {
                          vErrors.push(err121);
                        }
                        errors++;
                      }
                    }
                    if (data.archived !== void 0) {
                      if (typeof data.archived !== "boolean") {
                        const err122 = { instancePath: instancePath + "/archived", schemaPath: "#/anyOf/6/properties/archived/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                        if (vErrors === null) {
                          vErrors = [err122];
                        } else {
                          vErrors.push(err122);
                        }
                        errors++;
                      }
                    }
                  } else {
                    const err123 = { instancePath, schemaPath: "#/anyOf/6/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                    if (vErrors === null) {
                      vErrors = [err123];
                    } else {
                      vErrors.push(err123);
                    }
                    errors++;
                  }
                  var _valid0 = _errs92 === errors;
                  valid0 = valid0 || _valid0;
                  if (!valid0) {
                    const _errs103 = errors;
                    if (data && typeof data == "object" && !Array.isArray(data)) {
                      if (data.kind === void 0) {
                        const err124 = { instancePath, schemaPath: "#/anyOf/7/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                        if (vErrors === null) {
                          vErrors = [err124];
                        } else {
                          vErrors.push(err124);
                        }
                        errors++;
                      }
                      if (data.intentId === void 0) {
                        const err125 = { instancePath, schemaPath: "#/anyOf/7/required", keyword: "required", params: { missingProperty: "intentId" }, message: "must have required property 'intentId'" };
                        if (vErrors === null) {
                          vErrors = [err125];
                        } else {
                          vErrors.push(err125);
                        }
                        errors++;
                      }
                      if (data.goalId === void 0) {
                        const err126 = { instancePath, schemaPath: "#/anyOf/7/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
                        if (vErrors === null) {
                          vErrors = [err126];
                        } else {
                          vErrors.push(err126);
                        }
                        errors++;
                      }
                      for (const key8 in data) {
                        if (!(key8 === "kind" || key8 === "intentId" || key8 === "goalId")) {
                          const err127 = { instancePath, schemaPath: "#/anyOf/7/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key8 }, message: "must NOT have additional properties" };
                          if (vErrors === null) {
                            vErrors = [err127];
                          } else {
                            vErrors.push(err127);
                          }
                          errors++;
                        }
                      }
                      if (data.kind !== void 0) {
                        let data40 = data.kind;
                        if (typeof data40 !== "string") {
                          const err128 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/7/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err128];
                          } else {
                            vErrors.push(err128);
                          }
                          errors++;
                        }
                        if ("goal_delete" !== data40) {
                          const err129 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/7/properties/kind/const", keyword: "const", params: { allowedValue: "goal_delete" }, message: "must be equal to constant" };
                          if (vErrors === null) {
                            vErrors = [err129];
                          } else {
                            vErrors.push(err129);
                          }
                          errors++;
                        }
                      }
                      if (data.intentId !== void 0) {
                        let data41 = data.intentId;
                        if (typeof data41 === "string") {
                          if (!pattern0.test(data41)) {
                            const err130 = { instancePath: instancePath + "/intentId", schemaPath: "#/anyOf/7/properties/intentId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                            if (vErrors === null) {
                              vErrors = [err130];
                            } else {
                              vErrors.push(err130);
                            }
                            errors++;
                          }
                        } else {
                          const err131 = { instancePath: instancePath + "/intentId", schemaPath: "#/anyOf/7/properties/intentId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err131];
                          } else {
                            vErrors.push(err131);
                          }
                          errors++;
                        }
                      }
                      if (data.goalId !== void 0) {
                        let data42 = data.goalId;
                        if (typeof data42 === "string") {
                          if (!pattern0.test(data42)) {
                            const err132 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/7/properties/goalId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                            if (vErrors === null) {
                              vErrors = [err132];
                            } else {
                              vErrors.push(err132);
                            }
                            errors++;
                          }
                        } else {
                          const err133 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/7/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                          if (vErrors === null) {
                            vErrors = [err133];
                          } else {
                            vErrors.push(err133);
                          }
                          errors++;
                        }
                      }
                    } else {
                      const err134 = { instancePath, schemaPath: "#/anyOf/7/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                      if (vErrors === null) {
                        vErrors = [err134];
                      } else {
                        vErrors.push(err134);
                      }
                      errors++;
                    }
                    var _valid0 = _errs103 === errors;
                    valid0 = valid0 || _valid0;
                    if (!valid0) {
                      const _errs112 = errors;
                      if (data && typeof data == "object" && !Array.isArray(data)) {
                        if (data.kind === void 0) {
                          const err135 = { instancePath, schemaPath: "#/anyOf/8/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                          if (vErrors === null) {
                            vErrors = [err135];
                          } else {
                            vErrors.push(err135);
                          }
                          errors++;
                        }
                        if (data.intentId === void 0) {
                          const err136 = { instancePath, schemaPath: "#/anyOf/8/required", keyword: "required", params: { missingProperty: "intentId" }, message: "must have required property 'intentId'" };
                          if (vErrors === null) {
                            vErrors = [err136];
                          } else {
                            vErrors.push(err136);
                          }
                          errors++;
                        }
                        if (data.goalId === void 0) {
                          const err137 = { instancePath, schemaPath: "#/anyOf/8/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
                          if (vErrors === null) {
                            vErrors = [err137];
                          } else {
                            vErrors.push(err137);
                          }
                          errors++;
                        }
                        if (data.runId === void 0) {
                          const err138 = { instancePath, schemaPath: "#/anyOf/8/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
                          if (vErrors === null) {
                            vErrors = [err138];
                          } else {
                            vErrors.push(err138);
                          }
                          errors++;
                        }
                        if (data.actionId === void 0) {
                          const err139 = { instancePath, schemaPath: "#/anyOf/8/required", keyword: "required", params: { missingProperty: "actionId" }, message: "must have required property 'actionId'" };
                          if (vErrors === null) {
                            vErrors = [err139];
                          } else {
                            vErrors.push(err139);
                          }
                          errors++;
                        }
                        for (const key9 in data) {
                          if (!(key9 === "kind" || key9 === "intentId" || key9 === "goalId" || key9 === "runId" || key9 === "actionId" || key9 === "input" || key9 === "scope")) {
                            const err140 = { instancePath, schemaPath: "#/anyOf/8/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key9 }, message: "must NOT have additional properties" };
                            if (vErrors === null) {
                              vErrors = [err140];
                            } else {
                              vErrors.push(err140);
                            }
                            errors++;
                          }
                        }
                        if (data.kind !== void 0) {
                          let data43 = data.kind;
                          if (typeof data43 !== "string") {
                            const err141 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/8/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err141];
                            } else {
                              vErrors.push(err141);
                            }
                            errors++;
                          }
                          if ("action_review" !== data43) {
                            const err142 = { instancePath: instancePath + "/kind", schemaPath: "#/anyOf/8/properties/kind/const", keyword: "const", params: { allowedValue: "action_review" }, message: "must be equal to constant" };
                            if (vErrors === null) {
                              vErrors = [err142];
                            } else {
                              vErrors.push(err142);
                            }
                            errors++;
                          }
                        }
                        if (data.intentId !== void 0) {
                          let data44 = data.intentId;
                          if (typeof data44 === "string") {
                            if (!pattern0.test(data44)) {
                              const err143 = { instancePath: instancePath + "/intentId", schemaPath: "#/anyOf/8/properties/intentId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                              if (vErrors === null) {
                                vErrors = [err143];
                              } else {
                                vErrors.push(err143);
                              }
                              errors++;
                            }
                          } else {
                            const err144 = { instancePath: instancePath + "/intentId", schemaPath: "#/anyOf/8/properties/intentId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err144];
                            } else {
                              vErrors.push(err144);
                            }
                            errors++;
                          }
                        }
                        if (data.goalId !== void 0) {
                          let data45 = data.goalId;
                          if (typeof data45 === "string") {
                            if (!pattern0.test(data45)) {
                              const err145 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/8/properties/goalId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                              if (vErrors === null) {
                                vErrors = [err145];
                              } else {
                                vErrors.push(err145);
                              }
                              errors++;
                            }
                          } else {
                            const err146 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/8/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err146];
                            } else {
                              vErrors.push(err146);
                            }
                            errors++;
                          }
                        }
                        if (data.runId !== void 0) {
                          let data46 = data.runId;
                          if (typeof data46 === "string") {
                            if (!pattern0.test(data46)) {
                              const err147 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/8/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                              if (vErrors === null) {
                                vErrors = [err147];
                              } else {
                                vErrors.push(err147);
                              }
                              errors++;
                            }
                          } else {
                            const err148 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/8/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err148];
                            } else {
                              vErrors.push(err148);
                            }
                            errors++;
                          }
                        }
                        if (data.actionId !== void 0) {
                          let data47 = data.actionId;
                          if (typeof data47 === "string") {
                            if (!pattern0.test(data47)) {
                              const err149 = { instancePath: instancePath + "/actionId", schemaPath: "#/anyOf/8/properties/actionId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                              if (vErrors === null) {
                                vErrors = [err149];
                              } else {
                                vErrors.push(err149);
                              }
                              errors++;
                            }
                          } else {
                            const err150 = { instancePath: instancePath + "/actionId", schemaPath: "#/anyOf/8/properties/actionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err150];
                            } else {
                              vErrors.push(err150);
                            }
                            errors++;
                          }
                        }
                        if (data.input !== void 0) {
                          if (!validate16(data.input, { instancePath: instancePath + "/input", parentData: data, parentDataProperty: "input", rootData })) {
                            vErrors = vErrors === null ? validate16.errors : vErrors.concat(validate16.errors);
                            errors = vErrors.length;
                          }
                        }
                        if (data.scope !== void 0) {
                          let data49 = data.scope;
                          if (typeof data49 !== "string") {
                            const err151 = { instancePath: instancePath + "/scope", schemaPath: "#/definitions/BrowserActionReviewScope/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                            if (vErrors === null) {
                              vErrors = [err151];
                            } else {
                              vErrors.push(err151);
                            }
                            errors++;
                          }
                          if (!(data49 === "action" || data49 === "goal" || data49 === "workspace")) {
                            const err152 = { instancePath: instancePath + "/scope", schemaPath: "#/definitions/BrowserActionReviewScope/enum", keyword: "enum", params: { allowedValues: schema20.enum }, message: "must be equal to one of the allowed values" };
                            if (vErrors === null) {
                              vErrors = [err152];
                            } else {
                              vErrors.push(err152);
                            }
                            errors++;
                          }
                        }
                      } else {
                        const err153 = { instancePath, schemaPath: "#/anyOf/8/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                        if (vErrors === null) {
                          vErrors = [err153];
                        } else {
                          vErrors.push(err153);
                        }
                        errors++;
                      }
                      var _valid0 = _errs112 === errors;
                      valid0 = valid0 || _valid0;
                    }
                  }
                }
              }
            }
          }
        }
      }
      if (!valid0) {
        const err154 = { instancePath, schemaPath: "#/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err154];
        } else {
          vErrors.push(err154);
        }
        errors++;
      } else {
        errors = _errs0;
        if (vErrors !== null) {
          if (_errs0) {
            vErrors.length = _errs0;
          } else {
            vErrors = null;
          }
        }
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
export default require_BrowserControlIntentCommand_validator();
