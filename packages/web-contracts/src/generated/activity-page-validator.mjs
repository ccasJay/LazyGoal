var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// BrowserActivityPage-validator.cjs
var require_BrowserActivityPage_validator = __commonJS({
  "BrowserActivityPage-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema12 = { "type": "object", "properties": { "goalId": { "type": "string", "pattern": "\\S" }, "runFilter": { "type": "string", "pattern": "\\S" }, "limit": { "type": "integer", "minimum": 1, "maximum": 100 }, "items": { "type": "array", "items": { "$ref": "#/definitions/BrowserActivityItem" } }, "runs": { "type": "array", "items": { "$ref": "#/definitions/BrowserActivityRunContext" } }, "window": { "type": "array", "items": { "$ref": "#/definitions/BrowserActivityRunWindow" } }, "gaps": { "type": "array", "items": { "$ref": "#/definitions/BrowserActivityGap" }, "maxItems": 2 }, "range": { "$ref": "#/definitions/BrowserActivityRange" }, "stages": { "type": "array", "items": { "$ref": "#/definitions/BrowserActivityStageContext" } }, "actionGroups": { "type": "array", "items": { "$ref": "#/definitions/BrowserActivityActionContext" } }, "beforeCursor": { "type": "string", "pattern": "^[A-Za-z0-9_-]+$" }, "afterCursor": { "type": "string", "pattern": "^[A-Za-z0-9_-]+$" } }, "required": ["goalId", "limit", "items", "runs", "window", "gaps", "range", "stages", "actionGroups"], "additionalProperties": false, "description": "\u56FA\u5B9A\u6C34\u4F4D\u7684\u4E00\u9875 Activity \u67E5\u8BE2\u7ED3\u679C\u3002" };
    var schema34 = { "type": "object", "properties": { "runId": { "type": "string", "pattern": "\\S" }, "stageId": { "type": "string", "pattern": "\\S" }, "revision": { "type": "integer", "maximum": 9007199254740991, "minimum": 1 }, "status": { "type": "string", "enum": ["executing", "accepted", "rejected"] }, "target": { "type": "string" }, "firstSequence": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "lastSequence": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "completeWithinPage": { "type": "boolean" } }, "required": ["runId", "stageId", "revision", "status", "firstSequence", "completeWithinPage"], "additionalProperties": false, "description": "Activity \u9875\u4E2D\u8DE8\u9875\u9636\u6BB5\u7684\u5B89\u5168\u4E0A\u4E0B\u6587\u3002" };
    var func2 = Object.prototype.hasOwnProperty;
    var pattern0 = new RegExp("\\S", "u");
    var pattern36 = new RegExp("^[A-Za-z0-9_-]+$", "u");
    var schema14 = { "type": "object", "properties": { "type": { "type": "string", "const": "message" }, "itemId": { "type": "string", "pattern": "\\S" }, "messageId": { "type": "string", "pattern": "\\S" }, "role": { "type": "string", "enum": ["user", "assistant"] }, "purpose": { "type": "string", "enum": ["process", "answer", "notice"] }, "previewId": { "type": "string", "pattern": "\\S" }, "runId": { "type": "string", "pattern": "\\S" }, "position": { "$ref": "#/definitions/BrowserActivityPosition" }, "content": { "type": "string" }, "contentLength": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "truncated": { "type": "boolean" } }, "required": ["type", "itemId", "messageId", "role", "runId", "position", "content", "contentLength", "truncated"], "additionalProperties": false, "description": "Activity \u7A97\u53E3\u4E2D\u7684\u6B63\u5F0F\u6D88\u606F\u6458\u8981\u3002" };
    var schema15 = { "type": "object", "properties": { "runId": { "type": "string", "pattern": "\\S" }, "runOrder": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "sequence": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "itemKind": { "type": "string", "enum": ["fact", "message"] }, "order": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 } }, "required": ["runId", "runOrder", "sequence", "itemKind", "order"], "additionalProperties": false, "description": "Activity \u9879\u5728\u56FA\u5B9A\u5386\u53F2\u7A97\u53E3\u5185\u7684\u7A33\u5B9A\u6392\u5E8F\u952E\u3002" };
    function validate13(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.type === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.itemId === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "itemId" }, message: "must have required property 'itemId'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.messageId === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "messageId" }, message: "must have required property 'messageId'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.role === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.runId === void 0) {
          const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        if (data.position === void 0) {
          const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "position" }, message: "must have required property 'position'" };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        if (data.content === void 0) {
          const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "content" }, message: "must have required property 'content'" };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
        if (data.contentLength === void 0) {
          const err7 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "contentLength" }, message: "must have required property 'contentLength'" };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
        if (data.truncated === void 0) {
          const err8 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "truncated" }, message: "must have required property 'truncated'" };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!func2.call(schema14.properties, key0)) {
            const err9 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
        }
        if (data.type !== void 0) {
          let data0 = data.type;
          if (typeof data0 !== "string") {
            const err10 = { instancePath: instancePath + "/type", schemaPath: "#/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
          if ("message" !== data0) {
            const err11 = { instancePath: instancePath + "/type", schemaPath: "#/properties/type/const", keyword: "const", params: { allowedValue: "message" }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
        }
        if (data.itemId !== void 0) {
          let data1 = data.itemId;
          if (typeof data1 === "string") {
            if (!pattern0.test(data1)) {
              const err12 = { instancePath: instancePath + "/itemId", schemaPath: "#/properties/itemId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
          } else {
            const err13 = { instancePath: instancePath + "/itemId", schemaPath: "#/properties/itemId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
        }
        if (data.messageId !== void 0) {
          let data2 = data.messageId;
          if (typeof data2 === "string") {
            if (!pattern0.test(data2)) {
              const err14 = { instancePath: instancePath + "/messageId", schemaPath: "#/properties/messageId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err14];
              } else {
                vErrors.push(err14);
              }
              errors++;
            }
          } else {
            const err15 = { instancePath: instancePath + "/messageId", schemaPath: "#/properties/messageId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
        }
        if (data.role !== void 0) {
          let data3 = data.role;
          if (typeof data3 !== "string") {
            const err16 = { instancePath: instancePath + "/role", schemaPath: "#/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err16];
            } else {
              vErrors.push(err16);
            }
            errors++;
          }
          if (!(data3 === "user" || data3 === "assistant")) {
            const err17 = { instancePath: instancePath + "/role", schemaPath: "#/properties/role/enum", keyword: "enum", params: { allowedValues: schema14.properties.role.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err17];
            } else {
              vErrors.push(err17);
            }
            errors++;
          }
        }
        if (data.purpose !== void 0) {
          let data4 = data.purpose;
          if (typeof data4 !== "string") {
            const err18 = { instancePath: instancePath + "/purpose", schemaPath: "#/properties/purpose/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err18];
            } else {
              vErrors.push(err18);
            }
            errors++;
          }
          if (!(data4 === "process" || data4 === "answer" || data4 === "notice")) {
            const err19 = { instancePath: instancePath + "/purpose", schemaPath: "#/properties/purpose/enum", keyword: "enum", params: { allowedValues: schema14.properties.purpose.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err19];
            } else {
              vErrors.push(err19);
            }
            errors++;
          }
        }
        if (data.previewId !== void 0) {
          let data5 = data.previewId;
          if (typeof data5 === "string") {
            if (!pattern0.test(data5)) {
              const err20 = { instancePath: instancePath + "/previewId", schemaPath: "#/properties/previewId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err20];
              } else {
                vErrors.push(err20);
              }
              errors++;
            }
          } else {
            const err21 = { instancePath: instancePath + "/previewId", schemaPath: "#/properties/previewId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err21];
            } else {
              vErrors.push(err21);
            }
            errors++;
          }
        }
        if (data.runId !== void 0) {
          let data6 = data.runId;
          if (typeof data6 === "string") {
            if (!pattern0.test(data6)) {
              const err22 = { instancePath: instancePath + "/runId", schemaPath: "#/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err22];
              } else {
                vErrors.push(err22);
              }
              errors++;
            }
          } else {
            const err23 = { instancePath: instancePath + "/runId", schemaPath: "#/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err23];
            } else {
              vErrors.push(err23);
            }
            errors++;
          }
        }
        if (data.position !== void 0) {
          let data7 = data.position;
          if (data7 && typeof data7 == "object" && !Array.isArray(data7)) {
            if (data7.runId === void 0) {
              const err24 = { instancePath: instancePath + "/position", schemaPath: "#/definitions/BrowserActivityPosition/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
              if (vErrors === null) {
                vErrors = [err24];
              } else {
                vErrors.push(err24);
              }
              errors++;
            }
            if (data7.runOrder === void 0) {
              const err25 = { instancePath: instancePath + "/position", schemaPath: "#/definitions/BrowserActivityPosition/required", keyword: "required", params: { missingProperty: "runOrder" }, message: "must have required property 'runOrder'" };
              if (vErrors === null) {
                vErrors = [err25];
              } else {
                vErrors.push(err25);
              }
              errors++;
            }
            if (data7.sequence === void 0) {
              const err26 = { instancePath: instancePath + "/position", schemaPath: "#/definitions/BrowserActivityPosition/required", keyword: "required", params: { missingProperty: "sequence" }, message: "must have required property 'sequence'" };
              if (vErrors === null) {
                vErrors = [err26];
              } else {
                vErrors.push(err26);
              }
              errors++;
            }
            if (data7.itemKind === void 0) {
              const err27 = { instancePath: instancePath + "/position", schemaPath: "#/definitions/BrowserActivityPosition/required", keyword: "required", params: { missingProperty: "itemKind" }, message: "must have required property 'itemKind'" };
              if (vErrors === null) {
                vErrors = [err27];
              } else {
                vErrors.push(err27);
              }
              errors++;
            }
            if (data7.order === void 0) {
              const err28 = { instancePath: instancePath + "/position", schemaPath: "#/definitions/BrowserActivityPosition/required", keyword: "required", params: { missingProperty: "order" }, message: "must have required property 'order'" };
              if (vErrors === null) {
                vErrors = [err28];
              } else {
                vErrors.push(err28);
              }
              errors++;
            }
            for (const key1 in data7) {
              if (!(key1 === "runId" || key1 === "runOrder" || key1 === "sequence" || key1 === "itemKind" || key1 === "order")) {
                const err29 = { instancePath: instancePath + "/position", schemaPath: "#/definitions/BrowserActivityPosition/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err29];
                } else {
                  vErrors.push(err29);
                }
                errors++;
              }
            }
            if (data7.runId !== void 0) {
              let data8 = data7.runId;
              if (typeof data8 === "string") {
                if (!pattern0.test(data8)) {
                  const err30 = { instancePath: instancePath + "/position/runId", schemaPath: "#/definitions/BrowserActivityPosition/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                  if (vErrors === null) {
                    vErrors = [err30];
                  } else {
                    vErrors.push(err30);
                  }
                  errors++;
                }
              } else {
                const err31 = { instancePath: instancePath + "/position/runId", schemaPath: "#/definitions/BrowserActivityPosition/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err31];
                } else {
                  vErrors.push(err31);
                }
                errors++;
              }
            }
            if (data7.runOrder !== void 0) {
              let data9 = data7.runOrder;
              if (!(typeof data9 == "number" && (!(data9 % 1) && !isNaN(data9)) && isFinite(data9))) {
                const err32 = { instancePath: instancePath + "/position/runOrder", schemaPath: "#/definitions/BrowserActivityPosition/properties/runOrder/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err32];
                } else {
                  vErrors.push(err32);
                }
                errors++;
              }
              if (typeof data9 == "number" && isFinite(data9)) {
                if (data9 > 9007199254740991 || isNaN(data9)) {
                  const err33 = { instancePath: instancePath + "/position/runOrder", schemaPath: "#/definitions/BrowserActivityPosition/properties/runOrder/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                  if (vErrors === null) {
                    vErrors = [err33];
                  } else {
                    vErrors.push(err33);
                  }
                  errors++;
                }
                if (data9 < 0 || isNaN(data9)) {
                  const err34 = { instancePath: instancePath + "/position/runOrder", schemaPath: "#/definitions/BrowserActivityPosition/properties/runOrder/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err34];
                  } else {
                    vErrors.push(err34);
                  }
                  errors++;
                }
              }
            }
            if (data7.sequence !== void 0) {
              let data10 = data7.sequence;
              if (!(typeof data10 == "number" && (!(data10 % 1) && !isNaN(data10)) && isFinite(data10))) {
                const err35 = { instancePath: instancePath + "/position/sequence", schemaPath: "#/definitions/BrowserActivityPosition/properties/sequence/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err35];
                } else {
                  vErrors.push(err35);
                }
                errors++;
              }
              if (typeof data10 == "number" && isFinite(data10)) {
                if (data10 > 9007199254740991 || isNaN(data10)) {
                  const err36 = { instancePath: instancePath + "/position/sequence", schemaPath: "#/definitions/BrowserActivityPosition/properties/sequence/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                  if (vErrors === null) {
                    vErrors = [err36];
                  } else {
                    vErrors.push(err36);
                  }
                  errors++;
                }
                if (data10 < 0 || isNaN(data10)) {
                  const err37 = { instancePath: instancePath + "/position/sequence", schemaPath: "#/definitions/BrowserActivityPosition/properties/sequence/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err37];
                  } else {
                    vErrors.push(err37);
                  }
                  errors++;
                }
              }
            }
            if (data7.itemKind !== void 0) {
              let data11 = data7.itemKind;
              if (typeof data11 !== "string") {
                const err38 = { instancePath: instancePath + "/position/itemKind", schemaPath: "#/definitions/BrowserActivityPosition/properties/itemKind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err38];
                } else {
                  vErrors.push(err38);
                }
                errors++;
              }
              if (!(data11 === "fact" || data11 === "message")) {
                const err39 = { instancePath: instancePath + "/position/itemKind", schemaPath: "#/definitions/BrowserActivityPosition/properties/itemKind/enum", keyword: "enum", params: { allowedValues: schema15.properties.itemKind.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err39];
                } else {
                  vErrors.push(err39);
                }
                errors++;
              }
            }
            if (data7.order !== void 0) {
              let data12 = data7.order;
              if (!(typeof data12 == "number" && (!(data12 % 1) && !isNaN(data12)) && isFinite(data12))) {
                const err40 = { instancePath: instancePath + "/position/order", schemaPath: "#/definitions/BrowserActivityPosition/properties/order/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err40];
                } else {
                  vErrors.push(err40);
                }
                errors++;
              }
              if (typeof data12 == "number" && isFinite(data12)) {
                if (data12 > 9007199254740991 || isNaN(data12)) {
                  const err41 = { instancePath: instancePath + "/position/order", schemaPath: "#/definitions/BrowserActivityPosition/properties/order/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                  if (vErrors === null) {
                    vErrors = [err41];
                  } else {
                    vErrors.push(err41);
                  }
                  errors++;
                }
                if (data12 < 0 || isNaN(data12)) {
                  const err42 = { instancePath: instancePath + "/position/order", schemaPath: "#/definitions/BrowserActivityPosition/properties/order/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err42];
                  } else {
                    vErrors.push(err42);
                  }
                  errors++;
                }
              }
            }
          } else {
            const err43 = { instancePath: instancePath + "/position", schemaPath: "#/definitions/BrowserActivityPosition/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err43];
            } else {
              vErrors.push(err43);
            }
            errors++;
          }
        }
        if (data.content !== void 0) {
          if (typeof data.content !== "string") {
            const err44 = { instancePath: instancePath + "/content", schemaPath: "#/properties/content/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err44];
            } else {
              vErrors.push(err44);
            }
            errors++;
          }
        }
        if (data.contentLength !== void 0) {
          let data14 = data.contentLength;
          if (!(typeof data14 == "number" && (!(data14 % 1) && !isNaN(data14)) && isFinite(data14))) {
            const err45 = { instancePath: instancePath + "/contentLength", schemaPath: "#/properties/contentLength/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err45];
            } else {
              vErrors.push(err45);
            }
            errors++;
          }
          if (typeof data14 == "number" && isFinite(data14)) {
            if (data14 > 9007199254740991 || isNaN(data14)) {
              const err46 = { instancePath: instancePath + "/contentLength", schemaPath: "#/properties/contentLength/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err46];
              } else {
                vErrors.push(err46);
              }
              errors++;
            }
            if (data14 < 0 || isNaN(data14)) {
              const err47 = { instancePath: instancePath + "/contentLength", schemaPath: "#/properties/contentLength/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err47];
              } else {
                vErrors.push(err47);
              }
              errors++;
            }
          }
        }
        if (data.truncated !== void 0) {
          if (typeof data.truncated !== "boolean") {
            const err48 = { instancePath: instancePath + "/truncated", schemaPath: "#/properties/truncated/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err48];
            } else {
              vErrors.push(err48);
            }
            errors++;
          }
        }
      } else {
        const err49 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err49];
        } else {
          vErrors.push(err49);
        }
        errors++;
      }
      validate13.errors = vErrors;
      return errors === 0;
    }
    var schema16 = { "type": "object", "properties": { "type": { "type": "string", "const": "fact" }, "itemId": { "type": "string", "pattern": "\\S" }, "eventId": { "type": "string", "pattern": "\\S" }, "runId": { "type": "string", "pattern": "\\S" }, "position": { "$ref": "#/definitions/BrowserActivityPosition" }, "eventType": { "$ref": "#/definitions/BrowserActivityEventType" }, "title": { "type": "string" }, "detail": { "type": "string" }, "lookupId": { "type": "string", "pattern": "\\S" }, "lookupRequest": { "type": "string" }, "lookupErrorCode": { "type": "string", "enum": ["INVALID_CONTEXT_LOOKUP", "CONTEXT_LOOKUP_CHAIN_LIMIT", "CONTEXT_LOOKUP_UNAVAILABLE", "CONTEXT_LOOKUP_FAILED", "INVALID_CONTEXT_LOOKUP_RESULT"] }, "executionUnitId": { "type": "string", "pattern": "\\S" }, "actionId": { "type": "string", "pattern": "\\S" }, "stageId": { "type": "string", "pattern": "\\S" }, "stageRevision": { "type": "integer", "maximum": 9007199254740991, "minimum": 1 }, "stageTarget": { "type": "string", "pattern": "\\S" }, "tool": { "$ref": "#/definitions/BrowserActivityToolState" } }, "required": ["type", "itemId", "eventId", "runId", "position", "eventType", "title"], "additionalProperties": false, "description": "Activity \u7A97\u53E3\u4E2D\u7684\u5B89\u5168\u8F68\u8FF9\u4E8B\u5B9E\u6458\u8981\u3002" };
    var schema18 = { "type": "string", "enum": ["run_created", "run_started", "run_waiting", "run_completed", "run_failed", "run_cancelled", "run_stage_declared", "run_stage_accepted", "run_stage_rejected", "decision_received", "model_repair_feedback_recorded", "model_request_retry_recorded", "context_lookup_requested", "context_lookup_completed", "context_lookup_not_found", "context_lookup_failed", "action_staged", "action_approved", "action_revised", "action_rejected", "tool_started", "tool_attempt_started", "tool_attempt_failed", "tool_finished", "observation_recorded", "ask_user_answered", "ask_user_replied", "ask_user_skipped", "task_approved", "task_feedback_received", "session_input_applied", "steer_input_applied"], "description": "Activity \u5386\u53F2\u4E2D\u5141\u8BB8\u6295\u5F71\u7684\u5DF2\u63D0\u4EA4\u4E8B\u4EF6\u7C7B\u578B\u3002" };
    var schema19 = { "type": "object", "properties": { "toolId": { "type": "string", "pattern": "\\S" }, "status": { "type": "string", "enum": ["recorded", "pending-result", "completed", "failed", "rejected"] }, "actionStatus": { "type": "string", "enum": ["awaiting_approval", "approved", "rejected"] }, "inputSummary": { "type": "string" }, "summary": { "type": "string" }, "attempts": { "type": "array", "items": { "type": "string" } }, "lifecycle": { "type": "array", "items": { "$ref": "#/definitions/BrowserActivityToolLifecycleEntry" } }, "revisionRef": { "type": "string", "pattern": "\\S" }, "recoveryRef": { "type": "string", "pattern": "\\S" }, "parentActionId": { "type": "string", "pattern": "\\S" }, "activityBoundaryBefore": { "type": "boolean", "const": true } }, "required": ["toolId", "status"], "additionalProperties": false, "description": "Activity \u4E8B\u5B9E\u9879\u643A\u5E26\u7684\u5DF2\u63D0\u4EA4\u5DE5\u5177\u72B6\u6001\u767D\u540D\u5355\u6295\u5F71\u3002" };
    var schema20 = { "type": "object", "properties": { "kind": { "type": "string", "enum": ["approval", "execution", "retry", "result"] }, "title": { "type": "string", "pattern": "\\S" }, "detail": { "type": "string" } }, "required": ["kind", "title"], "additionalProperties": false, "description": "Activity \u4E8B\u5B9E\u9879\u643A\u5E26\u7684\u5DF2\u63D0\u4EA4\u5DE5\u5177\u751F\u547D\u5468\u671F\u8BB0\u5F55\u3002" };
    function validate16(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.toolId === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "toolId" }, message: "must have required property 'toolId'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.status === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!func2.call(schema19.properties, key0)) {
            const err2 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.toolId !== void 0) {
          let data0 = data.toolId;
          if (typeof data0 === "string") {
            if (!pattern0.test(data0)) {
              const err3 = { instancePath: instancePath + "/toolId", schemaPath: "#/properties/toolId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err3];
              } else {
                vErrors.push(err3);
              }
              errors++;
            }
          } else {
            const err4 = { instancePath: instancePath + "/toolId", schemaPath: "#/properties/toolId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.status !== void 0) {
          let data1 = data.status;
          if (typeof data1 !== "string") {
            const err5 = { instancePath: instancePath + "/status", schemaPath: "#/properties/status/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
          if (!(data1 === "recorded" || data1 === "pending-result" || data1 === "completed" || data1 === "failed" || data1 === "rejected")) {
            const err6 = { instancePath: instancePath + "/status", schemaPath: "#/properties/status/enum", keyword: "enum", params: { allowedValues: schema19.properties.status.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data.actionStatus !== void 0) {
          let data2 = data.actionStatus;
          if (typeof data2 !== "string") {
            const err7 = { instancePath: instancePath + "/actionStatus", schemaPath: "#/properties/actionStatus/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
          if (!(data2 === "awaiting_approval" || data2 === "approved" || data2 === "rejected")) {
            const err8 = { instancePath: instancePath + "/actionStatus", schemaPath: "#/properties/actionStatus/enum", keyword: "enum", params: { allowedValues: schema19.properties.actionStatus.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data.inputSummary !== void 0) {
          if (typeof data.inputSummary !== "string") {
            const err9 = { instancePath: instancePath + "/inputSummary", schemaPath: "#/properties/inputSummary/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
        }
        if (data.summary !== void 0) {
          if (typeof data.summary !== "string") {
            const err10 = { instancePath: instancePath + "/summary", schemaPath: "#/properties/summary/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data.attempts !== void 0) {
          let data5 = data.attempts;
          if (Array.isArray(data5)) {
            const len0 = data5.length;
            for (let i0 = 0; i0 < len0; i0++) {
              if (typeof data5[i0] !== "string") {
                const err11 = { instancePath: instancePath + "/attempts/" + i0, schemaPath: "#/properties/attempts/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err11];
                } else {
                  vErrors.push(err11);
                }
                errors++;
              }
            }
          } else {
            const err12 = { instancePath: instancePath + "/attempts", schemaPath: "#/properties/attempts/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
        }
        if (data.lifecycle !== void 0) {
          let data7 = data.lifecycle;
          if (Array.isArray(data7)) {
            const len1 = data7.length;
            for (let i1 = 0; i1 < len1; i1++) {
              let data8 = data7[i1];
              if (data8 && typeof data8 == "object" && !Array.isArray(data8)) {
                if (data8.kind === void 0) {
                  const err13 = { instancePath: instancePath + "/lifecycle/" + i1, schemaPath: "#/definitions/BrowserActivityToolLifecycleEntry/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                  if (vErrors === null) {
                    vErrors = [err13];
                  } else {
                    vErrors.push(err13);
                  }
                  errors++;
                }
                if (data8.title === void 0) {
                  const err14 = { instancePath: instancePath + "/lifecycle/" + i1, schemaPath: "#/definitions/BrowserActivityToolLifecycleEntry/required", keyword: "required", params: { missingProperty: "title" }, message: "must have required property 'title'" };
                  if (vErrors === null) {
                    vErrors = [err14];
                  } else {
                    vErrors.push(err14);
                  }
                  errors++;
                }
                for (const key1 in data8) {
                  if (!(key1 === "kind" || key1 === "title" || key1 === "detail")) {
                    const err15 = { instancePath: instancePath + "/lifecycle/" + i1, schemaPath: "#/definitions/BrowserActivityToolLifecycleEntry/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err15];
                    } else {
                      vErrors.push(err15);
                    }
                    errors++;
                  }
                }
                if (data8.kind !== void 0) {
                  let data9 = data8.kind;
                  if (typeof data9 !== "string") {
                    const err16 = { instancePath: instancePath + "/lifecycle/" + i1 + "/kind", schemaPath: "#/definitions/BrowserActivityToolLifecycleEntry/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err16];
                    } else {
                      vErrors.push(err16);
                    }
                    errors++;
                  }
                  if (!(data9 === "approval" || data9 === "execution" || data9 === "retry" || data9 === "result")) {
                    const err17 = { instancePath: instancePath + "/lifecycle/" + i1 + "/kind", schemaPath: "#/definitions/BrowserActivityToolLifecycleEntry/properties/kind/enum", keyword: "enum", params: { allowedValues: schema20.properties.kind.enum }, message: "must be equal to one of the allowed values" };
                    if (vErrors === null) {
                      vErrors = [err17];
                    } else {
                      vErrors.push(err17);
                    }
                    errors++;
                  }
                }
                if (data8.title !== void 0) {
                  let data10 = data8.title;
                  if (typeof data10 === "string") {
                    if (!pattern0.test(data10)) {
                      const err18 = { instancePath: instancePath + "/lifecycle/" + i1 + "/title", schemaPath: "#/definitions/BrowserActivityToolLifecycleEntry/properties/title/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err18];
                      } else {
                        vErrors.push(err18);
                      }
                      errors++;
                    }
                  } else {
                    const err19 = { instancePath: instancePath + "/lifecycle/" + i1 + "/title", schemaPath: "#/definitions/BrowserActivityToolLifecycleEntry/properties/title/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err19];
                    } else {
                      vErrors.push(err19);
                    }
                    errors++;
                  }
                }
                if (data8.detail !== void 0) {
                  if (typeof data8.detail !== "string") {
                    const err20 = { instancePath: instancePath + "/lifecycle/" + i1 + "/detail", schemaPath: "#/definitions/BrowserActivityToolLifecycleEntry/properties/detail/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err20];
                    } else {
                      vErrors.push(err20);
                    }
                    errors++;
                  }
                }
              } else {
                const err21 = { instancePath: instancePath + "/lifecycle/" + i1, schemaPath: "#/definitions/BrowserActivityToolLifecycleEntry/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err21];
                } else {
                  vErrors.push(err21);
                }
                errors++;
              }
            }
          } else {
            const err22 = { instancePath: instancePath + "/lifecycle", schemaPath: "#/properties/lifecycle/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err22];
            } else {
              vErrors.push(err22);
            }
            errors++;
          }
        }
        if (data.revisionRef !== void 0) {
          let data12 = data.revisionRef;
          if (typeof data12 === "string") {
            if (!pattern0.test(data12)) {
              const err23 = { instancePath: instancePath + "/revisionRef", schemaPath: "#/properties/revisionRef/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err23];
              } else {
                vErrors.push(err23);
              }
              errors++;
            }
          } else {
            const err24 = { instancePath: instancePath + "/revisionRef", schemaPath: "#/properties/revisionRef/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err24];
            } else {
              vErrors.push(err24);
            }
            errors++;
          }
        }
        if (data.recoveryRef !== void 0) {
          let data13 = data.recoveryRef;
          if (typeof data13 === "string") {
            if (!pattern0.test(data13)) {
              const err25 = { instancePath: instancePath + "/recoveryRef", schemaPath: "#/properties/recoveryRef/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err25];
              } else {
                vErrors.push(err25);
              }
              errors++;
            }
          } else {
            const err26 = { instancePath: instancePath + "/recoveryRef", schemaPath: "#/properties/recoveryRef/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err26];
            } else {
              vErrors.push(err26);
            }
            errors++;
          }
        }
        if (data.parentActionId !== void 0) {
          let data14 = data.parentActionId;
          if (typeof data14 === "string") {
            if (!pattern0.test(data14)) {
              const err27 = { instancePath: instancePath + "/parentActionId", schemaPath: "#/properties/parentActionId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err27];
              } else {
                vErrors.push(err27);
              }
              errors++;
            }
          } else {
            const err28 = { instancePath: instancePath + "/parentActionId", schemaPath: "#/properties/parentActionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err28];
            } else {
              vErrors.push(err28);
            }
            errors++;
          }
        }
        if (data.activityBoundaryBefore !== void 0) {
          let data15 = data.activityBoundaryBefore;
          if (typeof data15 !== "boolean") {
            const err29 = { instancePath: instancePath + "/activityBoundaryBefore", schemaPath: "#/properties/activityBoundaryBefore/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err29];
            } else {
              vErrors.push(err29);
            }
            errors++;
          }
          if (true !== data15) {
            const err30 = { instancePath: instancePath + "/activityBoundaryBefore", schemaPath: "#/properties/activityBoundaryBefore/const", keyword: "const", params: { allowedValue: true }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err30];
            } else {
              vErrors.push(err30);
            }
            errors++;
          }
        }
      } else {
        const err31 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err31];
        } else {
          vErrors.push(err31);
        }
        errors++;
      }
      validate16.errors = vErrors;
      return errors === 0;
    }
    function validate15(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.type === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.itemId === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "itemId" }, message: "must have required property 'itemId'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.eventId === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "eventId" }, message: "must have required property 'eventId'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.runId === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.position === void 0) {
          const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "position" }, message: "must have required property 'position'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        if (data.eventType === void 0) {
          const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "eventType" }, message: "must have required property 'eventType'" };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        if (data.title === void 0) {
          const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "title" }, message: "must have required property 'title'" };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!func2.call(schema16.properties, key0)) {
            const err7 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
        if (data.type !== void 0) {
          let data0 = data.type;
          if (typeof data0 !== "string") {
            const err8 = { instancePath: instancePath + "/type", schemaPath: "#/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
          if ("fact" !== data0) {
            const err9 = { instancePath: instancePath + "/type", schemaPath: "#/properties/type/const", keyword: "const", params: { allowedValue: "fact" }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
        }
        if (data.itemId !== void 0) {
          let data1 = data.itemId;
          if (typeof data1 === "string") {
            if (!pattern0.test(data1)) {
              const err10 = { instancePath: instancePath + "/itemId", schemaPath: "#/properties/itemId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
          } else {
            const err11 = { instancePath: instancePath + "/itemId", schemaPath: "#/properties/itemId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
        }
        if (data.eventId !== void 0) {
          let data2 = data.eventId;
          if (typeof data2 === "string") {
            if (!pattern0.test(data2)) {
              const err12 = { instancePath: instancePath + "/eventId", schemaPath: "#/properties/eventId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
          } else {
            const err13 = { instancePath: instancePath + "/eventId", schemaPath: "#/properties/eventId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
        }
        if (data.runId !== void 0) {
          let data3 = data.runId;
          if (typeof data3 === "string") {
            if (!pattern0.test(data3)) {
              const err14 = { instancePath: instancePath + "/runId", schemaPath: "#/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err14];
              } else {
                vErrors.push(err14);
              }
              errors++;
            }
          } else {
            const err15 = { instancePath: instancePath + "/runId", schemaPath: "#/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
        }
        if (data.position !== void 0) {
          let data4 = data.position;
          if (data4 && typeof data4 == "object" && !Array.isArray(data4)) {
            if (data4.runId === void 0) {
              const err16 = { instancePath: instancePath + "/position", schemaPath: "#/definitions/BrowserActivityPosition/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
              if (vErrors === null) {
                vErrors = [err16];
              } else {
                vErrors.push(err16);
              }
              errors++;
            }
            if (data4.runOrder === void 0) {
              const err17 = { instancePath: instancePath + "/position", schemaPath: "#/definitions/BrowserActivityPosition/required", keyword: "required", params: { missingProperty: "runOrder" }, message: "must have required property 'runOrder'" };
              if (vErrors === null) {
                vErrors = [err17];
              } else {
                vErrors.push(err17);
              }
              errors++;
            }
            if (data4.sequence === void 0) {
              const err18 = { instancePath: instancePath + "/position", schemaPath: "#/definitions/BrowserActivityPosition/required", keyword: "required", params: { missingProperty: "sequence" }, message: "must have required property 'sequence'" };
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
            if (data4.itemKind === void 0) {
              const err19 = { instancePath: instancePath + "/position", schemaPath: "#/definitions/BrowserActivityPosition/required", keyword: "required", params: { missingProperty: "itemKind" }, message: "must have required property 'itemKind'" };
              if (vErrors === null) {
                vErrors = [err19];
              } else {
                vErrors.push(err19);
              }
              errors++;
            }
            if (data4.order === void 0) {
              const err20 = { instancePath: instancePath + "/position", schemaPath: "#/definitions/BrowserActivityPosition/required", keyword: "required", params: { missingProperty: "order" }, message: "must have required property 'order'" };
              if (vErrors === null) {
                vErrors = [err20];
              } else {
                vErrors.push(err20);
              }
              errors++;
            }
            for (const key1 in data4) {
              if (!(key1 === "runId" || key1 === "runOrder" || key1 === "sequence" || key1 === "itemKind" || key1 === "order")) {
                const err21 = { instancePath: instancePath + "/position", schemaPath: "#/definitions/BrowserActivityPosition/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err21];
                } else {
                  vErrors.push(err21);
                }
                errors++;
              }
            }
            if (data4.runId !== void 0) {
              let data5 = data4.runId;
              if (typeof data5 === "string") {
                if (!pattern0.test(data5)) {
                  const err22 = { instancePath: instancePath + "/position/runId", schemaPath: "#/definitions/BrowserActivityPosition/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                  if (vErrors === null) {
                    vErrors = [err22];
                  } else {
                    vErrors.push(err22);
                  }
                  errors++;
                }
              } else {
                const err23 = { instancePath: instancePath + "/position/runId", schemaPath: "#/definitions/BrowserActivityPosition/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err23];
                } else {
                  vErrors.push(err23);
                }
                errors++;
              }
            }
            if (data4.runOrder !== void 0) {
              let data6 = data4.runOrder;
              if (!(typeof data6 == "number" && (!(data6 % 1) && !isNaN(data6)) && isFinite(data6))) {
                const err24 = { instancePath: instancePath + "/position/runOrder", schemaPath: "#/definitions/BrowserActivityPosition/properties/runOrder/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err24];
                } else {
                  vErrors.push(err24);
                }
                errors++;
              }
              if (typeof data6 == "number" && isFinite(data6)) {
                if (data6 > 9007199254740991 || isNaN(data6)) {
                  const err25 = { instancePath: instancePath + "/position/runOrder", schemaPath: "#/definitions/BrowserActivityPosition/properties/runOrder/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                  if (vErrors === null) {
                    vErrors = [err25];
                  } else {
                    vErrors.push(err25);
                  }
                  errors++;
                }
                if (data6 < 0 || isNaN(data6)) {
                  const err26 = { instancePath: instancePath + "/position/runOrder", schemaPath: "#/definitions/BrowserActivityPosition/properties/runOrder/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err26];
                  } else {
                    vErrors.push(err26);
                  }
                  errors++;
                }
              }
            }
            if (data4.sequence !== void 0) {
              let data7 = data4.sequence;
              if (!(typeof data7 == "number" && (!(data7 % 1) && !isNaN(data7)) && isFinite(data7))) {
                const err27 = { instancePath: instancePath + "/position/sequence", schemaPath: "#/definitions/BrowserActivityPosition/properties/sequence/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err27];
                } else {
                  vErrors.push(err27);
                }
                errors++;
              }
              if (typeof data7 == "number" && isFinite(data7)) {
                if (data7 > 9007199254740991 || isNaN(data7)) {
                  const err28 = { instancePath: instancePath + "/position/sequence", schemaPath: "#/definitions/BrowserActivityPosition/properties/sequence/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                  if (vErrors === null) {
                    vErrors = [err28];
                  } else {
                    vErrors.push(err28);
                  }
                  errors++;
                }
                if (data7 < 0 || isNaN(data7)) {
                  const err29 = { instancePath: instancePath + "/position/sequence", schemaPath: "#/definitions/BrowserActivityPosition/properties/sequence/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err29];
                  } else {
                    vErrors.push(err29);
                  }
                  errors++;
                }
              }
            }
            if (data4.itemKind !== void 0) {
              let data8 = data4.itemKind;
              if (typeof data8 !== "string") {
                const err30 = { instancePath: instancePath + "/position/itemKind", schemaPath: "#/definitions/BrowserActivityPosition/properties/itemKind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err30];
                } else {
                  vErrors.push(err30);
                }
                errors++;
              }
              if (!(data8 === "fact" || data8 === "message")) {
                const err31 = { instancePath: instancePath + "/position/itemKind", schemaPath: "#/definitions/BrowserActivityPosition/properties/itemKind/enum", keyword: "enum", params: { allowedValues: schema15.properties.itemKind.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err31];
                } else {
                  vErrors.push(err31);
                }
                errors++;
              }
            }
            if (data4.order !== void 0) {
              let data9 = data4.order;
              if (!(typeof data9 == "number" && (!(data9 % 1) && !isNaN(data9)) && isFinite(data9))) {
                const err32 = { instancePath: instancePath + "/position/order", schemaPath: "#/definitions/BrowserActivityPosition/properties/order/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err32];
                } else {
                  vErrors.push(err32);
                }
                errors++;
              }
              if (typeof data9 == "number" && isFinite(data9)) {
                if (data9 > 9007199254740991 || isNaN(data9)) {
                  const err33 = { instancePath: instancePath + "/position/order", schemaPath: "#/definitions/BrowserActivityPosition/properties/order/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                  if (vErrors === null) {
                    vErrors = [err33];
                  } else {
                    vErrors.push(err33);
                  }
                  errors++;
                }
                if (data9 < 0 || isNaN(data9)) {
                  const err34 = { instancePath: instancePath + "/position/order", schemaPath: "#/definitions/BrowserActivityPosition/properties/order/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
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
            const err35 = { instancePath: instancePath + "/position", schemaPath: "#/definitions/BrowserActivityPosition/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err35];
            } else {
              vErrors.push(err35);
            }
            errors++;
          }
        }
        if (data.eventType !== void 0) {
          let data10 = data.eventType;
          if (typeof data10 !== "string") {
            const err36 = { instancePath: instancePath + "/eventType", schemaPath: "#/definitions/BrowserActivityEventType/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err36];
            } else {
              vErrors.push(err36);
            }
            errors++;
          }
          if (!(data10 === "run_created" || data10 === "run_started" || data10 === "run_waiting" || data10 === "run_completed" || data10 === "run_failed" || data10 === "run_cancelled" || data10 === "run_stage_declared" || data10 === "run_stage_accepted" || data10 === "run_stage_rejected" || data10 === "decision_received" || data10 === "model_repair_feedback_recorded" || data10 === "model_request_retry_recorded" || data10 === "context_lookup_requested" || data10 === "context_lookup_completed" || data10 === "context_lookup_not_found" || data10 === "context_lookup_failed" || data10 === "action_staged" || data10 === "action_approved" || data10 === "action_revised" || data10 === "action_rejected" || data10 === "tool_started" || data10 === "tool_attempt_started" || data10 === "tool_attempt_failed" || data10 === "tool_finished" || data10 === "observation_recorded" || data10 === "ask_user_answered" || data10 === "ask_user_replied" || data10 === "ask_user_skipped" || data10 === "task_approved" || data10 === "task_feedback_received" || data10 === "session_input_applied" || data10 === "steer_input_applied")) {
            const err37 = { instancePath: instancePath + "/eventType", schemaPath: "#/definitions/BrowserActivityEventType/enum", keyword: "enum", params: { allowedValues: schema18.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err37];
            } else {
              vErrors.push(err37);
            }
            errors++;
          }
        }
        if (data.title !== void 0) {
          if (typeof data.title !== "string") {
            const err38 = { instancePath: instancePath + "/title", schemaPath: "#/properties/title/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err38];
            } else {
              vErrors.push(err38);
            }
            errors++;
          }
        }
        if (data.detail !== void 0) {
          if (typeof data.detail !== "string") {
            const err39 = { instancePath: instancePath + "/detail", schemaPath: "#/properties/detail/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err39];
            } else {
              vErrors.push(err39);
            }
            errors++;
          }
        }
        if (data.lookupId !== void 0) {
          let data13 = data.lookupId;
          if (typeof data13 === "string") {
            if (!pattern0.test(data13)) {
              const err40 = { instancePath: instancePath + "/lookupId", schemaPath: "#/properties/lookupId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err40];
              } else {
                vErrors.push(err40);
              }
              errors++;
            }
          } else {
            const err41 = { instancePath: instancePath + "/lookupId", schemaPath: "#/properties/lookupId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err41];
            } else {
              vErrors.push(err41);
            }
            errors++;
          }
        }
        if (data.lookupRequest !== void 0) {
          if (typeof data.lookupRequest !== "string") {
            const err42 = { instancePath: instancePath + "/lookupRequest", schemaPath: "#/properties/lookupRequest/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err42];
            } else {
              vErrors.push(err42);
            }
            errors++;
          }
        }
        if (data.lookupErrorCode !== void 0) {
          let data15 = data.lookupErrorCode;
          if (typeof data15 !== "string") {
            const err43 = { instancePath: instancePath + "/lookupErrorCode", schemaPath: "#/properties/lookupErrorCode/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err43];
            } else {
              vErrors.push(err43);
            }
            errors++;
          }
          if (!(data15 === "INVALID_CONTEXT_LOOKUP" || data15 === "CONTEXT_LOOKUP_CHAIN_LIMIT" || data15 === "CONTEXT_LOOKUP_UNAVAILABLE" || data15 === "CONTEXT_LOOKUP_FAILED" || data15 === "INVALID_CONTEXT_LOOKUP_RESULT")) {
            const err44 = { instancePath: instancePath + "/lookupErrorCode", schemaPath: "#/properties/lookupErrorCode/enum", keyword: "enum", params: { allowedValues: schema16.properties.lookupErrorCode.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err44];
            } else {
              vErrors.push(err44);
            }
            errors++;
          }
        }
        if (data.executionUnitId !== void 0) {
          let data16 = data.executionUnitId;
          if (typeof data16 === "string") {
            if (!pattern0.test(data16)) {
              const err45 = { instancePath: instancePath + "/executionUnitId", schemaPath: "#/properties/executionUnitId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err45];
              } else {
                vErrors.push(err45);
              }
              errors++;
            }
          } else {
            const err46 = { instancePath: instancePath + "/executionUnitId", schemaPath: "#/properties/executionUnitId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err46];
            } else {
              vErrors.push(err46);
            }
            errors++;
          }
        }
        if (data.actionId !== void 0) {
          let data17 = data.actionId;
          if (typeof data17 === "string") {
            if (!pattern0.test(data17)) {
              const err47 = { instancePath: instancePath + "/actionId", schemaPath: "#/properties/actionId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err47];
              } else {
                vErrors.push(err47);
              }
              errors++;
            }
          } else {
            const err48 = { instancePath: instancePath + "/actionId", schemaPath: "#/properties/actionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err48];
            } else {
              vErrors.push(err48);
            }
            errors++;
          }
        }
        if (data.stageId !== void 0) {
          let data18 = data.stageId;
          if (typeof data18 === "string") {
            if (!pattern0.test(data18)) {
              const err49 = { instancePath: instancePath + "/stageId", schemaPath: "#/properties/stageId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err49];
              } else {
                vErrors.push(err49);
              }
              errors++;
            }
          } else {
            const err50 = { instancePath: instancePath + "/stageId", schemaPath: "#/properties/stageId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err50];
            } else {
              vErrors.push(err50);
            }
            errors++;
          }
        }
        if (data.stageRevision !== void 0) {
          let data19 = data.stageRevision;
          if (!(typeof data19 == "number" && (!(data19 % 1) && !isNaN(data19)) && isFinite(data19))) {
            const err51 = { instancePath: instancePath + "/stageRevision", schemaPath: "#/properties/stageRevision/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err51];
            } else {
              vErrors.push(err51);
            }
            errors++;
          }
          if (typeof data19 == "number" && isFinite(data19)) {
            if (data19 > 9007199254740991 || isNaN(data19)) {
              const err52 = { instancePath: instancePath + "/stageRevision", schemaPath: "#/properties/stageRevision/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err52];
              } else {
                vErrors.push(err52);
              }
              errors++;
            }
            if (data19 < 1 || isNaN(data19)) {
              const err53 = { instancePath: instancePath + "/stageRevision", schemaPath: "#/properties/stageRevision/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
              if (vErrors === null) {
                vErrors = [err53];
              } else {
                vErrors.push(err53);
              }
              errors++;
            }
          }
        }
        if (data.stageTarget !== void 0) {
          let data20 = data.stageTarget;
          if (typeof data20 === "string") {
            if (!pattern0.test(data20)) {
              const err54 = { instancePath: instancePath + "/stageTarget", schemaPath: "#/properties/stageTarget/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err54];
              } else {
                vErrors.push(err54);
              }
              errors++;
            }
          } else {
            const err55 = { instancePath: instancePath + "/stageTarget", schemaPath: "#/properties/stageTarget/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err55];
            } else {
              vErrors.push(err55);
            }
            errors++;
          }
        }
        if (data.tool !== void 0) {
          if (!validate16(data.tool, { instancePath: instancePath + "/tool", parentData: data, parentDataProperty: "tool", rootData })) {
            vErrors = vErrors === null ? validate16.errors : vErrors.concat(validate16.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err56 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err56];
        } else {
          vErrors.push(err56);
        }
        errors++;
      }
      validate15.errors = vErrors;
      return errors === 0;
    }
    function validate19(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.type === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "type" }, message: "must have required property 'type'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.itemId === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "itemId" }, message: "must have required property 'itemId'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.runId === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.position === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "position" }, message: "must have required property 'position'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.think === void 0) {
          const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "think" }, message: "must have required property 'think'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "type" || key0 === "itemId" || key0 === "runId" || key0 === "position" || key0 === "executionUnitId" || key0 === "think")) {
            const err5 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.type !== void 0) {
          let data0 = data.type;
          if (typeof data0 !== "string") {
            const err6 = { instancePath: instancePath + "/type", schemaPath: "#/properties/type/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
          if ("think" !== data0) {
            const err7 = { instancePath: instancePath + "/type", schemaPath: "#/properties/type/const", keyword: "const", params: { allowedValue: "think" }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
        if (data.itemId !== void 0) {
          let data1 = data.itemId;
          if (typeof data1 === "string") {
            if (!pattern0.test(data1)) {
              const err8 = { instancePath: instancePath + "/itemId", schemaPath: "#/properties/itemId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err8];
              } else {
                vErrors.push(err8);
              }
              errors++;
            }
          } else {
            const err9 = { instancePath: instancePath + "/itemId", schemaPath: "#/properties/itemId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
        }
        if (data.runId !== void 0) {
          let data2 = data.runId;
          if (typeof data2 === "string") {
            if (!pattern0.test(data2)) {
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
        if (data.position !== void 0) {
          let data3 = data.position;
          if (data3 && typeof data3 == "object" && !Array.isArray(data3)) {
            if (data3.runId === void 0) {
              const err12 = { instancePath: instancePath + "/position", schemaPath: "#/definitions/BrowserActivityPosition/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
            if (data3.runOrder === void 0) {
              const err13 = { instancePath: instancePath + "/position", schemaPath: "#/definitions/BrowserActivityPosition/required", keyword: "required", params: { missingProperty: "runOrder" }, message: "must have required property 'runOrder'" };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
            if (data3.sequence === void 0) {
              const err14 = { instancePath: instancePath + "/position", schemaPath: "#/definitions/BrowserActivityPosition/required", keyword: "required", params: { missingProperty: "sequence" }, message: "must have required property 'sequence'" };
              if (vErrors === null) {
                vErrors = [err14];
              } else {
                vErrors.push(err14);
              }
              errors++;
            }
            if (data3.itemKind === void 0) {
              const err15 = { instancePath: instancePath + "/position", schemaPath: "#/definitions/BrowserActivityPosition/required", keyword: "required", params: { missingProperty: "itemKind" }, message: "must have required property 'itemKind'" };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            }
            if (data3.order === void 0) {
              const err16 = { instancePath: instancePath + "/position", schemaPath: "#/definitions/BrowserActivityPosition/required", keyword: "required", params: { missingProperty: "order" }, message: "must have required property 'order'" };
              if (vErrors === null) {
                vErrors = [err16];
              } else {
                vErrors.push(err16);
              }
              errors++;
            }
            for (const key1 in data3) {
              if (!(key1 === "runId" || key1 === "runOrder" || key1 === "sequence" || key1 === "itemKind" || key1 === "order")) {
                const err17 = { instancePath: instancePath + "/position", schemaPath: "#/definitions/BrowserActivityPosition/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err17];
                } else {
                  vErrors.push(err17);
                }
                errors++;
              }
            }
            if (data3.runId !== void 0) {
              let data4 = data3.runId;
              if (typeof data4 === "string") {
                if (!pattern0.test(data4)) {
                  const err18 = { instancePath: instancePath + "/position/runId", schemaPath: "#/definitions/BrowserActivityPosition/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                  if (vErrors === null) {
                    vErrors = [err18];
                  } else {
                    vErrors.push(err18);
                  }
                  errors++;
                }
              } else {
                const err19 = { instancePath: instancePath + "/position/runId", schemaPath: "#/definitions/BrowserActivityPosition/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err19];
                } else {
                  vErrors.push(err19);
                }
                errors++;
              }
            }
            if (data3.runOrder !== void 0) {
              let data5 = data3.runOrder;
              if (!(typeof data5 == "number" && (!(data5 % 1) && !isNaN(data5)) && isFinite(data5))) {
                const err20 = { instancePath: instancePath + "/position/runOrder", schemaPath: "#/definitions/BrowserActivityPosition/properties/runOrder/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err20];
                } else {
                  vErrors.push(err20);
                }
                errors++;
              }
              if (typeof data5 == "number" && isFinite(data5)) {
                if (data5 > 9007199254740991 || isNaN(data5)) {
                  const err21 = { instancePath: instancePath + "/position/runOrder", schemaPath: "#/definitions/BrowserActivityPosition/properties/runOrder/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                  if (vErrors === null) {
                    vErrors = [err21];
                  } else {
                    vErrors.push(err21);
                  }
                  errors++;
                }
                if (data5 < 0 || isNaN(data5)) {
                  const err22 = { instancePath: instancePath + "/position/runOrder", schemaPath: "#/definitions/BrowserActivityPosition/properties/runOrder/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err22];
                  } else {
                    vErrors.push(err22);
                  }
                  errors++;
                }
              }
            }
            if (data3.sequence !== void 0) {
              let data6 = data3.sequence;
              if (!(typeof data6 == "number" && (!(data6 % 1) && !isNaN(data6)) && isFinite(data6))) {
                const err23 = { instancePath: instancePath + "/position/sequence", schemaPath: "#/definitions/BrowserActivityPosition/properties/sequence/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err23];
                } else {
                  vErrors.push(err23);
                }
                errors++;
              }
              if (typeof data6 == "number" && isFinite(data6)) {
                if (data6 > 9007199254740991 || isNaN(data6)) {
                  const err24 = { instancePath: instancePath + "/position/sequence", schemaPath: "#/definitions/BrowserActivityPosition/properties/sequence/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                  if (vErrors === null) {
                    vErrors = [err24];
                  } else {
                    vErrors.push(err24);
                  }
                  errors++;
                }
                if (data6 < 0 || isNaN(data6)) {
                  const err25 = { instancePath: instancePath + "/position/sequence", schemaPath: "#/definitions/BrowserActivityPosition/properties/sequence/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err25];
                  } else {
                    vErrors.push(err25);
                  }
                  errors++;
                }
              }
            }
            if (data3.itemKind !== void 0) {
              let data7 = data3.itemKind;
              if (typeof data7 !== "string") {
                const err26 = { instancePath: instancePath + "/position/itemKind", schemaPath: "#/definitions/BrowserActivityPosition/properties/itemKind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err26];
                } else {
                  vErrors.push(err26);
                }
                errors++;
              }
              if (!(data7 === "fact" || data7 === "message")) {
                const err27 = { instancePath: instancePath + "/position/itemKind", schemaPath: "#/definitions/BrowserActivityPosition/properties/itemKind/enum", keyword: "enum", params: { allowedValues: schema15.properties.itemKind.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err27];
                } else {
                  vErrors.push(err27);
                }
                errors++;
              }
            }
            if (data3.order !== void 0) {
              let data8 = data3.order;
              if (!(typeof data8 == "number" && (!(data8 % 1) && !isNaN(data8)) && isFinite(data8))) {
                const err28 = { instancePath: instancePath + "/position/order", schemaPath: "#/definitions/BrowserActivityPosition/properties/order/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err28];
                } else {
                  vErrors.push(err28);
                }
                errors++;
              }
              if (typeof data8 == "number" && isFinite(data8)) {
                if (data8 > 9007199254740991 || isNaN(data8)) {
                  const err29 = { instancePath: instancePath + "/position/order", schemaPath: "#/definitions/BrowserActivityPosition/properties/order/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                  if (vErrors === null) {
                    vErrors = [err29];
                  } else {
                    vErrors.push(err29);
                  }
                  errors++;
                }
                if (data8 < 0 || isNaN(data8)) {
                  const err30 = { instancePath: instancePath + "/position/order", schemaPath: "#/definitions/BrowserActivityPosition/properties/order/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err30];
                  } else {
                    vErrors.push(err30);
                  }
                  errors++;
                }
              }
            }
          } else {
            const err31 = { instancePath: instancePath + "/position", schemaPath: "#/definitions/BrowserActivityPosition/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err31];
            } else {
              vErrors.push(err31);
            }
            errors++;
          }
        }
        if (data.executionUnitId !== void 0) {
          let data9 = data.executionUnitId;
          if (typeof data9 === "string") {
            if (!pattern0.test(data9)) {
              const err32 = { instancePath: instancePath + "/executionUnitId", schemaPath: "#/properties/executionUnitId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err32];
              } else {
                vErrors.push(err32);
              }
              errors++;
            }
          } else {
            const err33 = { instancePath: instancePath + "/executionUnitId", schemaPath: "#/properties/executionUnitId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err33];
            } else {
              vErrors.push(err33);
            }
            errors++;
          }
        }
        if (data.think !== void 0) {
          let data10 = data.think;
          if (data10 && typeof data10 == "object" && !Array.isArray(data10)) {
            if (data10.goal === void 0) {
              const err34 = { instancePath: instancePath + "/think", schemaPath: "#/definitions/BrowserSessionStepThink/required", keyword: "required", params: { missingProperty: "goal" }, message: "must have required property 'goal'" };
              if (vErrors === null) {
                vErrors = [err34];
              } else {
                vErrors.push(err34);
              }
              errors++;
            }
            for (const key2 in data10) {
              if (!(key2 === "goal" || key2 === "output" || key2 === "truncated")) {
                const err35 = { instancePath: instancePath + "/think", schemaPath: "#/definitions/BrowserSessionStepThink/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err35];
                } else {
                  vErrors.push(err35);
                }
                errors++;
              }
            }
            if (data10.goal !== void 0) {
              if (typeof data10.goal !== "string") {
                const err36 = { instancePath: instancePath + "/think/goal", schemaPath: "#/definitions/BrowserSessionStepThink/properties/goal/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err36];
                } else {
                  vErrors.push(err36);
                }
                errors++;
              }
            }
            if (data10.output !== void 0) {
              if (typeof data10.output !== "string") {
                const err37 = { instancePath: instancePath + "/think/output", schemaPath: "#/definitions/BrowserSessionStepThink/properties/output/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err37];
                } else {
                  vErrors.push(err37);
                }
                errors++;
              }
            }
            if (data10.truncated !== void 0) {
              let data13 = data10.truncated;
              if (typeof data13 !== "boolean") {
                const err38 = { instancePath: instancePath + "/think/truncated", schemaPath: "#/definitions/BrowserSessionStepThink/properties/truncated/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                if (vErrors === null) {
                  vErrors = [err38];
                } else {
                  vErrors.push(err38);
                }
                errors++;
              }
              if (true !== data13) {
                const err39 = { instancePath: instancePath + "/think/truncated", schemaPath: "#/definitions/BrowserSessionStepThink/properties/truncated/const", keyword: "const", params: { allowedValue: true }, message: "must be equal to constant" };
                if (vErrors === null) {
                  vErrors = [err39];
                } else {
                  vErrors.push(err39);
                }
                errors++;
              }
            }
          } else {
            const err40 = { instancePath: instancePath + "/think", schemaPath: "#/definitions/BrowserSessionStepThink/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err40];
            } else {
              vErrors.push(err40);
            }
            errors++;
          }
        }
      } else {
        const err41 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err41];
        } else {
          vErrors.push(err41);
        }
        errors++;
      }
      validate19.errors = vErrors;
      return errors === 0;
    }
    function validate12(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      const _errs0 = errors;
      let valid0 = false;
      const _errs1 = errors;
      if (!validate13(data, { instancePath, parentData, parentDataProperty, rootData })) {
        vErrors = vErrors === null ? validate13.errors : vErrors.concat(validate13.errors);
        errors = vErrors.length;
      }
      var _valid0 = _errs1 === errors;
      valid0 = valid0 || _valid0;
      if (!valid0) {
        const _errs2 = errors;
        if (!validate15(data, { instancePath, parentData, parentDataProperty, rootData })) {
          vErrors = vErrors === null ? validate15.errors : vErrors.concat(validate15.errors);
          errors = vErrors.length;
        }
        var _valid0 = _errs2 === errors;
        valid0 = valid0 || _valid0;
        if (!valid0) {
          const _errs3 = errors;
          if (!validate19(data, { instancePath, parentData, parentDataProperty, rootData })) {
            vErrors = vErrors === null ? validate19.errors : vErrors.concat(validate19.errors);
            errors = vErrors.length;
          }
          var _valid0 = _errs3 === errors;
          valid0 = valid0 || _valid0;
        }
      }
      if (!valid0) {
        const err0 = { instancePath, schemaPath: "#/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err0];
        } else {
          vErrors.push(err0);
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
    var schema25 = { "type": "string", "enum": ["created", "running", "waiting", "completed", "failed", "cancelled"], "description": "Run \u751F\u547D\u5468\u671F\u72B6\u6001\u3002" };
    function validate22(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.runId === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.status === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.current === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "current" }, message: "must have required property 'current'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.runOrder === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "runOrder" }, message: "must have required property 'runOrder'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.committedThroughSequence === void 0) {
          const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "committedThroughSequence" }, message: "must have required property 'committedThroughSequence'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "runId" || key0 === "status" || key0 === "current" || key0 === "runOrder" || key0 === "committedThroughSequence" || key0 === "terminalDetail")) {
            const err5 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.runId !== void 0) {
          let data0 = data.runId;
          if (typeof data0 === "string") {
            if (!pattern0.test(data0)) {
              const err6 = { instancePath: instancePath + "/runId", schemaPath: "#/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err6];
              } else {
                vErrors.push(err6);
              }
              errors++;
            }
          } else {
            const err7 = { instancePath: instancePath + "/runId", schemaPath: "#/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
        if (data.status !== void 0) {
          let data1 = data.status;
          if (typeof data1 !== "string") {
            const err8 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/BrowserRunStatus/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
          if (!(data1 === "created" || data1 === "running" || data1 === "waiting" || data1 === "completed" || data1 === "failed" || data1 === "cancelled")) {
            const err9 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/BrowserRunStatus/enum", keyword: "enum", params: { allowedValues: schema25.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
        }
        if (data.current !== void 0) {
          if (typeof data.current !== "boolean") {
            const err10 = { instancePath: instancePath + "/current", schemaPath: "#/properties/current/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data.runOrder !== void 0) {
          let data3 = data.runOrder;
          if (!(typeof data3 == "number" && (!(data3 % 1) && !isNaN(data3)) && isFinite(data3))) {
            const err11 = { instancePath: instancePath + "/runOrder", schemaPath: "#/properties/runOrder/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
          if (typeof data3 == "number" && isFinite(data3)) {
            if (data3 > 9007199254740991 || isNaN(data3)) {
              const err12 = { instancePath: instancePath + "/runOrder", schemaPath: "#/properties/runOrder/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
            if (data3 < 0 || isNaN(data3)) {
              const err13 = { instancePath: instancePath + "/runOrder", schemaPath: "#/properties/runOrder/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
          }
        }
        if (data.committedThroughSequence !== void 0) {
          let data4 = data.committedThroughSequence;
          if (!(typeof data4 == "number" && (!(data4 % 1) && !isNaN(data4)) && isFinite(data4))) {
            const err14 = { instancePath: instancePath + "/committedThroughSequence", schemaPath: "#/properties/committedThroughSequence/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
          if (typeof data4 == "number" && isFinite(data4)) {
            if (data4 > 9007199254740991 || isNaN(data4)) {
              const err15 = { instancePath: instancePath + "/committedThroughSequence", schemaPath: "#/properties/committedThroughSequence/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            }
            if (data4 < 0 || isNaN(data4)) {
              const err16 = { instancePath: instancePath + "/committedThroughSequence", schemaPath: "#/properties/committedThroughSequence/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err16];
              } else {
                vErrors.push(err16);
              }
              errors++;
            }
          }
        }
        if (data.terminalDetail !== void 0) {
          let data5 = data.terminalDetail;
          if (data5 && typeof data5 == "object" && !Array.isArray(data5)) {
            if (data5.message === void 0) {
              const err17 = { instancePath: instancePath + "/terminalDetail", schemaPath: "#/definitions/BrowserActivityRunTerminalDetail/required", keyword: "required", params: { missingProperty: "message" }, message: "must have required property 'message'" };
              if (vErrors === null) {
                vErrors = [err17];
              } else {
                vErrors.push(err17);
              }
              errors++;
            }
            for (const key1 in data5) {
              if (!(key1 === "code" || key1 === "message")) {
                const err18 = { instancePath: instancePath + "/terminalDetail", schemaPath: "#/definitions/BrowserActivityRunTerminalDetail/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err18];
                } else {
                  vErrors.push(err18);
                }
                errors++;
              }
            }
            if (data5.code !== void 0) {
              if (typeof data5.code !== "string") {
                const err19 = { instancePath: instancePath + "/terminalDetail/code", schemaPath: "#/definitions/BrowserActivityRunTerminalDetail/properties/code/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err19];
                } else {
                  vErrors.push(err19);
                }
                errors++;
              }
            }
            if (data5.message !== void 0) {
              if (typeof data5.message !== "string") {
                const err20 = { instancePath: instancePath + "/terminalDetail/message", schemaPath: "#/definitions/BrowserActivityRunTerminalDetail/properties/message/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err20];
                } else {
                  vErrors.push(err20);
                }
                errors++;
              }
            }
          } else {
            const err21 = { instancePath: instancePath + "/terminalDetail", schemaPath: "#/definitions/BrowserActivityRunTerminalDetail/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err21];
            } else {
              vErrors.push(err21);
            }
            errors++;
          }
        }
      } else {
        const err22 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err22];
        } else {
          vErrors.push(err22);
        }
        errors++;
      }
      validate22.errors = vErrors;
      return errors === 0;
    }
    var schema28 = { "type": "object", "properties": { "direction": { "type": "string", "enum": ["older", "newer"] }, "itemCount": { "type": "integer", "maximum": 9007199254740991, "minimum": 1 }, "first": { "$ref": "#/definitions/BrowserActivityPosition" }, "last": { "$ref": "#/definitions/BrowserActivityPosition" } }, "required": ["direction", "itemCount", "first", "last"], "additionalProperties": false, "description": "\u5F53\u524D\u9875\u4E4B\u5916\u3001\u4ECD\u53EF\u6309 Activity cursor \u8BFB\u53D6\u7684\u8FDE\u7EED\u9879\u533A\u95F4\u3002" };
    function validate24(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.direction === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "direction" }, message: "must have required property 'direction'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.itemCount === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "itemCount" }, message: "must have required property 'itemCount'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.first === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "first" }, message: "must have required property 'first'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.last === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "last" }, message: "must have required property 'last'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "direction" || key0 === "itemCount" || key0 === "first" || key0 === "last")) {
            const err4 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.direction !== void 0) {
          let data0 = data.direction;
          if (typeof data0 !== "string") {
            const err5 = { instancePath: instancePath + "/direction", schemaPath: "#/properties/direction/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
          if (!(data0 === "older" || data0 === "newer")) {
            const err6 = { instancePath: instancePath + "/direction", schemaPath: "#/properties/direction/enum", keyword: "enum", params: { allowedValues: schema28.properties.direction.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data.itemCount !== void 0) {
          let data1 = data.itemCount;
          if (!(typeof data1 == "number" && (!(data1 % 1) && !isNaN(data1)) && isFinite(data1))) {
            const err7 = { instancePath: instancePath + "/itemCount", schemaPath: "#/properties/itemCount/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
          if (typeof data1 == "number" && isFinite(data1)) {
            if (data1 > 9007199254740991 || isNaN(data1)) {
              const err8 = { instancePath: instancePath + "/itemCount", schemaPath: "#/properties/itemCount/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err8];
              } else {
                vErrors.push(err8);
              }
              errors++;
            }
            if (data1 < 1 || isNaN(data1)) {
              const err9 = { instancePath: instancePath + "/itemCount", schemaPath: "#/properties/itemCount/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
          }
        }
        if (data.first !== void 0) {
          let data2 = data.first;
          if (data2 && typeof data2 == "object" && !Array.isArray(data2)) {
            if (data2.runId === void 0) {
              const err10 = { instancePath: instancePath + "/first", schemaPath: "#/definitions/BrowserActivityPosition/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
            if (data2.runOrder === void 0) {
              const err11 = { instancePath: instancePath + "/first", schemaPath: "#/definitions/BrowserActivityPosition/required", keyword: "required", params: { missingProperty: "runOrder" }, message: "must have required property 'runOrder'" };
              if (vErrors === null) {
                vErrors = [err11];
              } else {
                vErrors.push(err11);
              }
              errors++;
            }
            if (data2.sequence === void 0) {
              const err12 = { instancePath: instancePath + "/first", schemaPath: "#/definitions/BrowserActivityPosition/required", keyword: "required", params: { missingProperty: "sequence" }, message: "must have required property 'sequence'" };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
            if (data2.itemKind === void 0) {
              const err13 = { instancePath: instancePath + "/first", schemaPath: "#/definitions/BrowserActivityPosition/required", keyword: "required", params: { missingProperty: "itemKind" }, message: "must have required property 'itemKind'" };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
            if (data2.order === void 0) {
              const err14 = { instancePath: instancePath + "/first", schemaPath: "#/definitions/BrowserActivityPosition/required", keyword: "required", params: { missingProperty: "order" }, message: "must have required property 'order'" };
              if (vErrors === null) {
                vErrors = [err14];
              } else {
                vErrors.push(err14);
              }
              errors++;
            }
            for (const key1 in data2) {
              if (!(key1 === "runId" || key1 === "runOrder" || key1 === "sequence" || key1 === "itemKind" || key1 === "order")) {
                const err15 = { instancePath: instancePath + "/first", schemaPath: "#/definitions/BrowserActivityPosition/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err15];
                } else {
                  vErrors.push(err15);
                }
                errors++;
              }
            }
            if (data2.runId !== void 0) {
              let data3 = data2.runId;
              if (typeof data3 === "string") {
                if (!pattern0.test(data3)) {
                  const err16 = { instancePath: instancePath + "/first/runId", schemaPath: "#/definitions/BrowserActivityPosition/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                  if (vErrors === null) {
                    vErrors = [err16];
                  } else {
                    vErrors.push(err16);
                  }
                  errors++;
                }
              } else {
                const err17 = { instancePath: instancePath + "/first/runId", schemaPath: "#/definitions/BrowserActivityPosition/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err17];
                } else {
                  vErrors.push(err17);
                }
                errors++;
              }
            }
            if (data2.runOrder !== void 0) {
              let data4 = data2.runOrder;
              if (!(typeof data4 == "number" && (!(data4 % 1) && !isNaN(data4)) && isFinite(data4))) {
                const err18 = { instancePath: instancePath + "/first/runOrder", schemaPath: "#/definitions/BrowserActivityPosition/properties/runOrder/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err18];
                } else {
                  vErrors.push(err18);
                }
                errors++;
              }
              if (typeof data4 == "number" && isFinite(data4)) {
                if (data4 > 9007199254740991 || isNaN(data4)) {
                  const err19 = { instancePath: instancePath + "/first/runOrder", schemaPath: "#/definitions/BrowserActivityPosition/properties/runOrder/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                  if (vErrors === null) {
                    vErrors = [err19];
                  } else {
                    vErrors.push(err19);
                  }
                  errors++;
                }
                if (data4 < 0 || isNaN(data4)) {
                  const err20 = { instancePath: instancePath + "/first/runOrder", schemaPath: "#/definitions/BrowserActivityPosition/properties/runOrder/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err20];
                  } else {
                    vErrors.push(err20);
                  }
                  errors++;
                }
              }
            }
            if (data2.sequence !== void 0) {
              let data5 = data2.sequence;
              if (!(typeof data5 == "number" && (!(data5 % 1) && !isNaN(data5)) && isFinite(data5))) {
                const err21 = { instancePath: instancePath + "/first/sequence", schemaPath: "#/definitions/BrowserActivityPosition/properties/sequence/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err21];
                } else {
                  vErrors.push(err21);
                }
                errors++;
              }
              if (typeof data5 == "number" && isFinite(data5)) {
                if (data5 > 9007199254740991 || isNaN(data5)) {
                  const err22 = { instancePath: instancePath + "/first/sequence", schemaPath: "#/definitions/BrowserActivityPosition/properties/sequence/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                  if (vErrors === null) {
                    vErrors = [err22];
                  } else {
                    vErrors.push(err22);
                  }
                  errors++;
                }
                if (data5 < 0 || isNaN(data5)) {
                  const err23 = { instancePath: instancePath + "/first/sequence", schemaPath: "#/definitions/BrowserActivityPosition/properties/sequence/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err23];
                  } else {
                    vErrors.push(err23);
                  }
                  errors++;
                }
              }
            }
            if (data2.itemKind !== void 0) {
              let data6 = data2.itemKind;
              if (typeof data6 !== "string") {
                const err24 = { instancePath: instancePath + "/first/itemKind", schemaPath: "#/definitions/BrowserActivityPosition/properties/itemKind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err24];
                } else {
                  vErrors.push(err24);
                }
                errors++;
              }
              if (!(data6 === "fact" || data6 === "message")) {
                const err25 = { instancePath: instancePath + "/first/itemKind", schemaPath: "#/definitions/BrowserActivityPosition/properties/itemKind/enum", keyword: "enum", params: { allowedValues: schema15.properties.itemKind.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err25];
                } else {
                  vErrors.push(err25);
                }
                errors++;
              }
            }
            if (data2.order !== void 0) {
              let data7 = data2.order;
              if (!(typeof data7 == "number" && (!(data7 % 1) && !isNaN(data7)) && isFinite(data7))) {
                const err26 = { instancePath: instancePath + "/first/order", schemaPath: "#/definitions/BrowserActivityPosition/properties/order/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err26];
                } else {
                  vErrors.push(err26);
                }
                errors++;
              }
              if (typeof data7 == "number" && isFinite(data7)) {
                if (data7 > 9007199254740991 || isNaN(data7)) {
                  const err27 = { instancePath: instancePath + "/first/order", schemaPath: "#/definitions/BrowserActivityPosition/properties/order/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                  if (vErrors === null) {
                    vErrors = [err27];
                  } else {
                    vErrors.push(err27);
                  }
                  errors++;
                }
                if (data7 < 0 || isNaN(data7)) {
                  const err28 = { instancePath: instancePath + "/first/order", schemaPath: "#/definitions/BrowserActivityPosition/properties/order/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err28];
                  } else {
                    vErrors.push(err28);
                  }
                  errors++;
                }
              }
            }
          } else {
            const err29 = { instancePath: instancePath + "/first", schemaPath: "#/definitions/BrowserActivityPosition/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err29];
            } else {
              vErrors.push(err29);
            }
            errors++;
          }
        }
        if (data.last !== void 0) {
          let data8 = data.last;
          if (data8 && typeof data8 == "object" && !Array.isArray(data8)) {
            if (data8.runId === void 0) {
              const err30 = { instancePath: instancePath + "/last", schemaPath: "#/definitions/BrowserActivityPosition/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
              if (vErrors === null) {
                vErrors = [err30];
              } else {
                vErrors.push(err30);
              }
              errors++;
            }
            if (data8.runOrder === void 0) {
              const err31 = { instancePath: instancePath + "/last", schemaPath: "#/definitions/BrowserActivityPosition/required", keyword: "required", params: { missingProperty: "runOrder" }, message: "must have required property 'runOrder'" };
              if (vErrors === null) {
                vErrors = [err31];
              } else {
                vErrors.push(err31);
              }
              errors++;
            }
            if (data8.sequence === void 0) {
              const err32 = { instancePath: instancePath + "/last", schemaPath: "#/definitions/BrowserActivityPosition/required", keyword: "required", params: { missingProperty: "sequence" }, message: "must have required property 'sequence'" };
              if (vErrors === null) {
                vErrors = [err32];
              } else {
                vErrors.push(err32);
              }
              errors++;
            }
            if (data8.itemKind === void 0) {
              const err33 = { instancePath: instancePath + "/last", schemaPath: "#/definitions/BrowserActivityPosition/required", keyword: "required", params: { missingProperty: "itemKind" }, message: "must have required property 'itemKind'" };
              if (vErrors === null) {
                vErrors = [err33];
              } else {
                vErrors.push(err33);
              }
              errors++;
            }
            if (data8.order === void 0) {
              const err34 = { instancePath: instancePath + "/last", schemaPath: "#/definitions/BrowserActivityPosition/required", keyword: "required", params: { missingProperty: "order" }, message: "must have required property 'order'" };
              if (vErrors === null) {
                vErrors = [err34];
              } else {
                vErrors.push(err34);
              }
              errors++;
            }
            for (const key2 in data8) {
              if (!(key2 === "runId" || key2 === "runOrder" || key2 === "sequence" || key2 === "itemKind" || key2 === "order")) {
                const err35 = { instancePath: instancePath + "/last", schemaPath: "#/definitions/BrowserActivityPosition/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err35];
                } else {
                  vErrors.push(err35);
                }
                errors++;
              }
            }
            if (data8.runId !== void 0) {
              let data9 = data8.runId;
              if (typeof data9 === "string") {
                if (!pattern0.test(data9)) {
                  const err36 = { instancePath: instancePath + "/last/runId", schemaPath: "#/definitions/BrowserActivityPosition/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                  if (vErrors === null) {
                    vErrors = [err36];
                  } else {
                    vErrors.push(err36);
                  }
                  errors++;
                }
              } else {
                const err37 = { instancePath: instancePath + "/last/runId", schemaPath: "#/definitions/BrowserActivityPosition/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err37];
                } else {
                  vErrors.push(err37);
                }
                errors++;
              }
            }
            if (data8.runOrder !== void 0) {
              let data10 = data8.runOrder;
              if (!(typeof data10 == "number" && (!(data10 % 1) && !isNaN(data10)) && isFinite(data10))) {
                const err38 = { instancePath: instancePath + "/last/runOrder", schemaPath: "#/definitions/BrowserActivityPosition/properties/runOrder/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err38];
                } else {
                  vErrors.push(err38);
                }
                errors++;
              }
              if (typeof data10 == "number" && isFinite(data10)) {
                if (data10 > 9007199254740991 || isNaN(data10)) {
                  const err39 = { instancePath: instancePath + "/last/runOrder", schemaPath: "#/definitions/BrowserActivityPosition/properties/runOrder/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                  if (vErrors === null) {
                    vErrors = [err39];
                  } else {
                    vErrors.push(err39);
                  }
                  errors++;
                }
                if (data10 < 0 || isNaN(data10)) {
                  const err40 = { instancePath: instancePath + "/last/runOrder", schemaPath: "#/definitions/BrowserActivityPosition/properties/runOrder/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err40];
                  } else {
                    vErrors.push(err40);
                  }
                  errors++;
                }
              }
            }
            if (data8.sequence !== void 0) {
              let data11 = data8.sequence;
              if (!(typeof data11 == "number" && (!(data11 % 1) && !isNaN(data11)) && isFinite(data11))) {
                const err41 = { instancePath: instancePath + "/last/sequence", schemaPath: "#/definitions/BrowserActivityPosition/properties/sequence/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err41];
                } else {
                  vErrors.push(err41);
                }
                errors++;
              }
              if (typeof data11 == "number" && isFinite(data11)) {
                if (data11 > 9007199254740991 || isNaN(data11)) {
                  const err42 = { instancePath: instancePath + "/last/sequence", schemaPath: "#/definitions/BrowserActivityPosition/properties/sequence/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                  if (vErrors === null) {
                    vErrors = [err42];
                  } else {
                    vErrors.push(err42);
                  }
                  errors++;
                }
                if (data11 < 0 || isNaN(data11)) {
                  const err43 = { instancePath: instancePath + "/last/sequence", schemaPath: "#/definitions/BrowserActivityPosition/properties/sequence/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err43];
                  } else {
                    vErrors.push(err43);
                  }
                  errors++;
                }
              }
            }
            if (data8.itemKind !== void 0) {
              let data12 = data8.itemKind;
              if (typeof data12 !== "string") {
                const err44 = { instancePath: instancePath + "/last/itemKind", schemaPath: "#/definitions/BrowserActivityPosition/properties/itemKind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err44];
                } else {
                  vErrors.push(err44);
                }
                errors++;
              }
              if (!(data12 === "fact" || data12 === "message")) {
                const err45 = { instancePath: instancePath + "/last/itemKind", schemaPath: "#/definitions/BrowserActivityPosition/properties/itemKind/enum", keyword: "enum", params: { allowedValues: schema15.properties.itemKind.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err45];
                } else {
                  vErrors.push(err45);
                }
                errors++;
              }
            }
            if (data8.order !== void 0) {
              let data13 = data8.order;
              if (!(typeof data13 == "number" && (!(data13 % 1) && !isNaN(data13)) && isFinite(data13))) {
                const err46 = { instancePath: instancePath + "/last/order", schemaPath: "#/definitions/BrowserActivityPosition/properties/order/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err46];
                } else {
                  vErrors.push(err46);
                }
                errors++;
              }
              if (typeof data13 == "number" && isFinite(data13)) {
                if (data13 > 9007199254740991 || isNaN(data13)) {
                  const err47 = { instancePath: instancePath + "/last/order", schemaPath: "#/definitions/BrowserActivityPosition/properties/order/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                  if (vErrors === null) {
                    vErrors = [err47];
                  } else {
                    vErrors.push(err47);
                  }
                  errors++;
                }
                if (data13 < 0 || isNaN(data13)) {
                  const err48 = { instancePath: instancePath + "/last/order", schemaPath: "#/definitions/BrowserActivityPosition/properties/order/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err48];
                  } else {
                    vErrors.push(err48);
                  }
                  errors++;
                }
              }
            }
          } else {
            const err49 = { instancePath: instancePath + "/last", schemaPath: "#/definitions/BrowserActivityPosition/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err49];
            } else {
              vErrors.push(err49);
            }
            errors++;
          }
        }
      } else {
        const err50 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err50];
        } else {
          vErrors.push(err50);
        }
        errors++;
      }
      validate24.errors = vErrors;
      return errors === 0;
    }
    function validate26(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.olderAvailable === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "olderAvailable" }, message: "must have required property 'olderAvailable'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.newerAvailable === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "newerAvailable" }, message: "must have required property 'newerAvailable'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "first" || key0 === "last" || key0 === "olderAvailable" || key0 === "newerAvailable")) {
            const err2 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.first !== void 0) {
          let data0 = data.first;
          if (data0 && typeof data0 == "object" && !Array.isArray(data0)) {
            if (data0.runId === void 0) {
              const err3 = { instancePath: instancePath + "/first", schemaPath: "#/definitions/BrowserActivityPosition/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
              if (vErrors === null) {
                vErrors = [err3];
              } else {
                vErrors.push(err3);
              }
              errors++;
            }
            if (data0.runOrder === void 0) {
              const err4 = { instancePath: instancePath + "/first", schemaPath: "#/definitions/BrowserActivityPosition/required", keyword: "required", params: { missingProperty: "runOrder" }, message: "must have required property 'runOrder'" };
              if (vErrors === null) {
                vErrors = [err4];
              } else {
                vErrors.push(err4);
              }
              errors++;
            }
            if (data0.sequence === void 0) {
              const err5 = { instancePath: instancePath + "/first", schemaPath: "#/definitions/BrowserActivityPosition/required", keyword: "required", params: { missingProperty: "sequence" }, message: "must have required property 'sequence'" };
              if (vErrors === null) {
                vErrors = [err5];
              } else {
                vErrors.push(err5);
              }
              errors++;
            }
            if (data0.itemKind === void 0) {
              const err6 = { instancePath: instancePath + "/first", schemaPath: "#/definitions/BrowserActivityPosition/required", keyword: "required", params: { missingProperty: "itemKind" }, message: "must have required property 'itemKind'" };
              if (vErrors === null) {
                vErrors = [err6];
              } else {
                vErrors.push(err6);
              }
              errors++;
            }
            if (data0.order === void 0) {
              const err7 = { instancePath: instancePath + "/first", schemaPath: "#/definitions/BrowserActivityPosition/required", keyword: "required", params: { missingProperty: "order" }, message: "must have required property 'order'" };
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
            for (const key1 in data0) {
              if (!(key1 === "runId" || key1 === "runOrder" || key1 === "sequence" || key1 === "itemKind" || key1 === "order")) {
                const err8 = { instancePath: instancePath + "/first", schemaPath: "#/definitions/BrowserActivityPosition/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err8];
                } else {
                  vErrors.push(err8);
                }
                errors++;
              }
            }
            if (data0.runId !== void 0) {
              let data1 = data0.runId;
              if (typeof data1 === "string") {
                if (!pattern0.test(data1)) {
                  const err9 = { instancePath: instancePath + "/first/runId", schemaPath: "#/definitions/BrowserActivityPosition/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                  if (vErrors === null) {
                    vErrors = [err9];
                  } else {
                    vErrors.push(err9);
                  }
                  errors++;
                }
              } else {
                const err10 = { instancePath: instancePath + "/first/runId", schemaPath: "#/definitions/BrowserActivityPosition/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err10];
                } else {
                  vErrors.push(err10);
                }
                errors++;
              }
            }
            if (data0.runOrder !== void 0) {
              let data2 = data0.runOrder;
              if (!(typeof data2 == "number" && (!(data2 % 1) && !isNaN(data2)) && isFinite(data2))) {
                const err11 = { instancePath: instancePath + "/first/runOrder", schemaPath: "#/definitions/BrowserActivityPosition/properties/runOrder/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err11];
                } else {
                  vErrors.push(err11);
                }
                errors++;
              }
              if (typeof data2 == "number" && isFinite(data2)) {
                if (data2 > 9007199254740991 || isNaN(data2)) {
                  const err12 = { instancePath: instancePath + "/first/runOrder", schemaPath: "#/definitions/BrowserActivityPosition/properties/runOrder/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                  if (vErrors === null) {
                    vErrors = [err12];
                  } else {
                    vErrors.push(err12);
                  }
                  errors++;
                }
                if (data2 < 0 || isNaN(data2)) {
                  const err13 = { instancePath: instancePath + "/first/runOrder", schemaPath: "#/definitions/BrowserActivityPosition/properties/runOrder/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err13];
                  } else {
                    vErrors.push(err13);
                  }
                  errors++;
                }
              }
            }
            if (data0.sequence !== void 0) {
              let data3 = data0.sequence;
              if (!(typeof data3 == "number" && (!(data3 % 1) && !isNaN(data3)) && isFinite(data3))) {
                const err14 = { instancePath: instancePath + "/first/sequence", schemaPath: "#/definitions/BrowserActivityPosition/properties/sequence/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err14];
                } else {
                  vErrors.push(err14);
                }
                errors++;
              }
              if (typeof data3 == "number" && isFinite(data3)) {
                if (data3 > 9007199254740991 || isNaN(data3)) {
                  const err15 = { instancePath: instancePath + "/first/sequence", schemaPath: "#/definitions/BrowserActivityPosition/properties/sequence/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                  if (vErrors === null) {
                    vErrors = [err15];
                  } else {
                    vErrors.push(err15);
                  }
                  errors++;
                }
                if (data3 < 0 || isNaN(data3)) {
                  const err16 = { instancePath: instancePath + "/first/sequence", schemaPath: "#/definitions/BrowserActivityPosition/properties/sequence/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err16];
                  } else {
                    vErrors.push(err16);
                  }
                  errors++;
                }
              }
            }
            if (data0.itemKind !== void 0) {
              let data4 = data0.itemKind;
              if (typeof data4 !== "string") {
                const err17 = { instancePath: instancePath + "/first/itemKind", schemaPath: "#/definitions/BrowserActivityPosition/properties/itemKind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err17];
                } else {
                  vErrors.push(err17);
                }
                errors++;
              }
              if (!(data4 === "fact" || data4 === "message")) {
                const err18 = { instancePath: instancePath + "/first/itemKind", schemaPath: "#/definitions/BrowserActivityPosition/properties/itemKind/enum", keyword: "enum", params: { allowedValues: schema15.properties.itemKind.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err18];
                } else {
                  vErrors.push(err18);
                }
                errors++;
              }
            }
            if (data0.order !== void 0) {
              let data5 = data0.order;
              if (!(typeof data5 == "number" && (!(data5 % 1) && !isNaN(data5)) && isFinite(data5))) {
                const err19 = { instancePath: instancePath + "/first/order", schemaPath: "#/definitions/BrowserActivityPosition/properties/order/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err19];
                } else {
                  vErrors.push(err19);
                }
                errors++;
              }
              if (typeof data5 == "number" && isFinite(data5)) {
                if (data5 > 9007199254740991 || isNaN(data5)) {
                  const err20 = { instancePath: instancePath + "/first/order", schemaPath: "#/definitions/BrowserActivityPosition/properties/order/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                  if (vErrors === null) {
                    vErrors = [err20];
                  } else {
                    vErrors.push(err20);
                  }
                  errors++;
                }
                if (data5 < 0 || isNaN(data5)) {
                  const err21 = { instancePath: instancePath + "/first/order", schemaPath: "#/definitions/BrowserActivityPosition/properties/order/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err21];
                  } else {
                    vErrors.push(err21);
                  }
                  errors++;
                }
              }
            }
          } else {
            const err22 = { instancePath: instancePath + "/first", schemaPath: "#/definitions/BrowserActivityPosition/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err22];
            } else {
              vErrors.push(err22);
            }
            errors++;
          }
        }
        if (data.last !== void 0) {
          let data6 = data.last;
          if (data6 && typeof data6 == "object" && !Array.isArray(data6)) {
            if (data6.runId === void 0) {
              const err23 = { instancePath: instancePath + "/last", schemaPath: "#/definitions/BrowserActivityPosition/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
              if (vErrors === null) {
                vErrors = [err23];
              } else {
                vErrors.push(err23);
              }
              errors++;
            }
            if (data6.runOrder === void 0) {
              const err24 = { instancePath: instancePath + "/last", schemaPath: "#/definitions/BrowserActivityPosition/required", keyword: "required", params: { missingProperty: "runOrder" }, message: "must have required property 'runOrder'" };
              if (vErrors === null) {
                vErrors = [err24];
              } else {
                vErrors.push(err24);
              }
              errors++;
            }
            if (data6.sequence === void 0) {
              const err25 = { instancePath: instancePath + "/last", schemaPath: "#/definitions/BrowserActivityPosition/required", keyword: "required", params: { missingProperty: "sequence" }, message: "must have required property 'sequence'" };
              if (vErrors === null) {
                vErrors = [err25];
              } else {
                vErrors.push(err25);
              }
              errors++;
            }
            if (data6.itemKind === void 0) {
              const err26 = { instancePath: instancePath + "/last", schemaPath: "#/definitions/BrowserActivityPosition/required", keyword: "required", params: { missingProperty: "itemKind" }, message: "must have required property 'itemKind'" };
              if (vErrors === null) {
                vErrors = [err26];
              } else {
                vErrors.push(err26);
              }
              errors++;
            }
            if (data6.order === void 0) {
              const err27 = { instancePath: instancePath + "/last", schemaPath: "#/definitions/BrowserActivityPosition/required", keyword: "required", params: { missingProperty: "order" }, message: "must have required property 'order'" };
              if (vErrors === null) {
                vErrors = [err27];
              } else {
                vErrors.push(err27);
              }
              errors++;
            }
            for (const key2 in data6) {
              if (!(key2 === "runId" || key2 === "runOrder" || key2 === "sequence" || key2 === "itemKind" || key2 === "order")) {
                const err28 = { instancePath: instancePath + "/last", schemaPath: "#/definitions/BrowserActivityPosition/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err28];
                } else {
                  vErrors.push(err28);
                }
                errors++;
              }
            }
            if (data6.runId !== void 0) {
              let data7 = data6.runId;
              if (typeof data7 === "string") {
                if (!pattern0.test(data7)) {
                  const err29 = { instancePath: instancePath + "/last/runId", schemaPath: "#/definitions/BrowserActivityPosition/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                  if (vErrors === null) {
                    vErrors = [err29];
                  } else {
                    vErrors.push(err29);
                  }
                  errors++;
                }
              } else {
                const err30 = { instancePath: instancePath + "/last/runId", schemaPath: "#/definitions/BrowserActivityPosition/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err30];
                } else {
                  vErrors.push(err30);
                }
                errors++;
              }
            }
            if (data6.runOrder !== void 0) {
              let data8 = data6.runOrder;
              if (!(typeof data8 == "number" && (!(data8 % 1) && !isNaN(data8)) && isFinite(data8))) {
                const err31 = { instancePath: instancePath + "/last/runOrder", schemaPath: "#/definitions/BrowserActivityPosition/properties/runOrder/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err31];
                } else {
                  vErrors.push(err31);
                }
                errors++;
              }
              if (typeof data8 == "number" && isFinite(data8)) {
                if (data8 > 9007199254740991 || isNaN(data8)) {
                  const err32 = { instancePath: instancePath + "/last/runOrder", schemaPath: "#/definitions/BrowserActivityPosition/properties/runOrder/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                  if (vErrors === null) {
                    vErrors = [err32];
                  } else {
                    vErrors.push(err32);
                  }
                  errors++;
                }
                if (data8 < 0 || isNaN(data8)) {
                  const err33 = { instancePath: instancePath + "/last/runOrder", schemaPath: "#/definitions/BrowserActivityPosition/properties/runOrder/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err33];
                  } else {
                    vErrors.push(err33);
                  }
                  errors++;
                }
              }
            }
            if (data6.sequence !== void 0) {
              let data9 = data6.sequence;
              if (!(typeof data9 == "number" && (!(data9 % 1) && !isNaN(data9)) && isFinite(data9))) {
                const err34 = { instancePath: instancePath + "/last/sequence", schemaPath: "#/definitions/BrowserActivityPosition/properties/sequence/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err34];
                } else {
                  vErrors.push(err34);
                }
                errors++;
              }
              if (typeof data9 == "number" && isFinite(data9)) {
                if (data9 > 9007199254740991 || isNaN(data9)) {
                  const err35 = { instancePath: instancePath + "/last/sequence", schemaPath: "#/definitions/BrowserActivityPosition/properties/sequence/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                  if (vErrors === null) {
                    vErrors = [err35];
                  } else {
                    vErrors.push(err35);
                  }
                  errors++;
                }
                if (data9 < 0 || isNaN(data9)) {
                  const err36 = { instancePath: instancePath + "/last/sequence", schemaPath: "#/definitions/BrowserActivityPosition/properties/sequence/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err36];
                  } else {
                    vErrors.push(err36);
                  }
                  errors++;
                }
              }
            }
            if (data6.itemKind !== void 0) {
              let data10 = data6.itemKind;
              if (typeof data10 !== "string") {
                const err37 = { instancePath: instancePath + "/last/itemKind", schemaPath: "#/definitions/BrowserActivityPosition/properties/itemKind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err37];
                } else {
                  vErrors.push(err37);
                }
                errors++;
              }
              if (!(data10 === "fact" || data10 === "message")) {
                const err38 = { instancePath: instancePath + "/last/itemKind", schemaPath: "#/definitions/BrowserActivityPosition/properties/itemKind/enum", keyword: "enum", params: { allowedValues: schema15.properties.itemKind.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err38];
                } else {
                  vErrors.push(err38);
                }
                errors++;
              }
            }
            if (data6.order !== void 0) {
              let data11 = data6.order;
              if (!(typeof data11 == "number" && (!(data11 % 1) && !isNaN(data11)) && isFinite(data11))) {
                const err39 = { instancePath: instancePath + "/last/order", schemaPath: "#/definitions/BrowserActivityPosition/properties/order/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err39];
                } else {
                  vErrors.push(err39);
                }
                errors++;
              }
              if (typeof data11 == "number" && isFinite(data11)) {
                if (data11 > 9007199254740991 || isNaN(data11)) {
                  const err40 = { instancePath: instancePath + "/last/order", schemaPath: "#/definitions/BrowserActivityPosition/properties/order/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                  if (vErrors === null) {
                    vErrors = [err40];
                  } else {
                    vErrors.push(err40);
                  }
                  errors++;
                }
                if (data11 < 0 || isNaN(data11)) {
                  const err41 = { instancePath: instancePath + "/last/order", schemaPath: "#/definitions/BrowserActivityPosition/properties/order/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err41];
                  } else {
                    vErrors.push(err41);
                  }
                  errors++;
                }
              }
            }
          } else {
            const err42 = { instancePath: instancePath + "/last", schemaPath: "#/definitions/BrowserActivityPosition/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err42];
            } else {
              vErrors.push(err42);
            }
            errors++;
          }
        }
        if (data.olderAvailable !== void 0) {
          if (typeof data.olderAvailable !== "boolean") {
            const err43 = { instancePath: instancePath + "/olderAvailable", schemaPath: "#/properties/olderAvailable/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err43];
            } else {
              vErrors.push(err43);
            }
            errors++;
          }
        }
        if (data.newerAvailable !== void 0) {
          if (typeof data.newerAvailable !== "boolean") {
            const err44 = { instancePath: instancePath + "/newerAvailable", schemaPath: "#/properties/newerAvailable/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err44];
            } else {
              vErrors.push(err44);
            }
            errors++;
          }
        }
      } else {
        const err45 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err45];
        } else {
          vErrors.push(err45);
        }
        errors++;
      }
      validate26.errors = vErrors;
      return errors === 0;
    }
    function validate11(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
        if (data.limit === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "limit" }, message: "must have required property 'limit'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.items === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "items" }, message: "must have required property 'items'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.runs === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "runs" }, message: "must have required property 'runs'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.window === void 0) {
          const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "window" }, message: "must have required property 'window'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        if (data.gaps === void 0) {
          const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "gaps" }, message: "must have required property 'gaps'" };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        if (data.range === void 0) {
          const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "range" }, message: "must have required property 'range'" };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
        if (data.stages === void 0) {
          const err7 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "stages" }, message: "must have required property 'stages'" };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
        if (data.actionGroups === void 0) {
          const err8 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "actionGroups" }, message: "must have required property 'actionGroups'" };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!func2.call(schema12.properties, key0)) {
            const err9 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
        }
        if (data.goalId !== void 0) {
          let data0 = data.goalId;
          if (typeof data0 === "string") {
            if (!pattern0.test(data0)) {
              const err10 = { instancePath: instancePath + "/goalId", schemaPath: "#/properties/goalId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
          } else {
            const err11 = { instancePath: instancePath + "/goalId", schemaPath: "#/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
        }
        if (data.runFilter !== void 0) {
          let data1 = data.runFilter;
          if (typeof data1 === "string") {
            if (!pattern0.test(data1)) {
              const err12 = { instancePath: instancePath + "/runFilter", schemaPath: "#/properties/runFilter/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
          } else {
            const err13 = { instancePath: instancePath + "/runFilter", schemaPath: "#/properties/runFilter/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
        }
        if (data.limit !== void 0) {
          let data2 = data.limit;
          if (!(typeof data2 == "number" && (!(data2 % 1) && !isNaN(data2)) && isFinite(data2))) {
            const err14 = { instancePath: instancePath + "/limit", schemaPath: "#/properties/limit/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
          if (typeof data2 == "number" && isFinite(data2)) {
            if (data2 > 100 || isNaN(data2)) {
              const err15 = { instancePath: instancePath + "/limit", schemaPath: "#/properties/limit/maximum", keyword: "maximum", params: { comparison: "<=", limit: 100 }, message: "must be <= 100" };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            }
            if (data2 < 1 || isNaN(data2)) {
              const err16 = { instancePath: instancePath + "/limit", schemaPath: "#/properties/limit/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
              if (vErrors === null) {
                vErrors = [err16];
              } else {
                vErrors.push(err16);
              }
              errors++;
            }
          }
        }
        if (data.items !== void 0) {
          let data3 = data.items;
          if (Array.isArray(data3)) {
            const len0 = data3.length;
            for (let i0 = 0; i0 < len0; i0++) {
              if (!validate12(data3[i0], { instancePath: instancePath + "/items/" + i0, parentData: data3, parentDataProperty: i0, rootData })) {
                vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                errors = vErrors.length;
              }
            }
          } else {
            const err17 = { instancePath: instancePath + "/items", schemaPath: "#/properties/items/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err17];
            } else {
              vErrors.push(err17);
            }
            errors++;
          }
        }
        if (data.runs !== void 0) {
          let data5 = data.runs;
          if (Array.isArray(data5)) {
            const len1 = data5.length;
            for (let i1 = 0; i1 < len1; i1++) {
              if (!validate22(data5[i1], { instancePath: instancePath + "/runs/" + i1, parentData: data5, parentDataProperty: i1, rootData })) {
                vErrors = vErrors === null ? validate22.errors : vErrors.concat(validate22.errors);
                errors = vErrors.length;
              }
            }
          } else {
            const err18 = { instancePath: instancePath + "/runs", schemaPath: "#/properties/runs/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err18];
            } else {
              vErrors.push(err18);
            }
            errors++;
          }
        }
        if (data.window !== void 0) {
          let data7 = data.window;
          if (Array.isArray(data7)) {
            const len2 = data7.length;
            for (let i2 = 0; i2 < len2; i2++) {
              let data8 = data7[i2];
              if (data8 && typeof data8 == "object" && !Array.isArray(data8)) {
                if (data8.runId === void 0) {
                  const err19 = { instancePath: instancePath + "/window/" + i2, schemaPath: "#/definitions/BrowserActivityRunWindow/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
                  if (vErrors === null) {
                    vErrors = [err19];
                  } else {
                    vErrors.push(err19);
                  }
                  errors++;
                }
                if (data8.messageCount === void 0) {
                  const err20 = { instancePath: instancePath + "/window/" + i2, schemaPath: "#/definitions/BrowserActivityRunWindow/required", keyword: "required", params: { missingProperty: "messageCount" }, message: "must have required property 'messageCount'" };
                  if (vErrors === null) {
                    vErrors = [err20];
                  } else {
                    vErrors.push(err20);
                  }
                  errors++;
                }
                if (data8.committedThroughSequence === void 0) {
                  const err21 = { instancePath: instancePath + "/window/" + i2, schemaPath: "#/definitions/BrowserActivityRunWindow/required", keyword: "required", params: { missingProperty: "committedThroughSequence" }, message: "must have required property 'committedThroughSequence'" };
                  if (vErrors === null) {
                    vErrors = [err21];
                  } else {
                    vErrors.push(err21);
                  }
                  errors++;
                }
                for (const key1 in data8) {
                  if (!(key1 === "runId" || key1 === "messageCount" || key1 === "throughMessageId" || key1 === "committedThroughSequence")) {
                    const err22 = { instancePath: instancePath + "/window/" + i2, schemaPath: "#/definitions/BrowserActivityRunWindow/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err22];
                    } else {
                      vErrors.push(err22);
                    }
                    errors++;
                  }
                }
                if (data8.runId !== void 0) {
                  let data9 = data8.runId;
                  if (typeof data9 === "string") {
                    if (!pattern0.test(data9)) {
                      const err23 = { instancePath: instancePath + "/window/" + i2 + "/runId", schemaPath: "#/definitions/BrowserActivityRunWindow/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err23];
                      } else {
                        vErrors.push(err23);
                      }
                      errors++;
                    }
                  } else {
                    const err24 = { instancePath: instancePath + "/window/" + i2 + "/runId", schemaPath: "#/definitions/BrowserActivityRunWindow/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err24];
                    } else {
                      vErrors.push(err24);
                    }
                    errors++;
                  }
                }
                if (data8.messageCount !== void 0) {
                  let data10 = data8.messageCount;
                  if (!(typeof data10 == "number" && (!(data10 % 1) && !isNaN(data10)) && isFinite(data10))) {
                    const err25 = { instancePath: instancePath + "/window/" + i2 + "/messageCount", schemaPath: "#/definitions/BrowserActivityRunWindow/properties/messageCount/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                    if (vErrors === null) {
                      vErrors = [err25];
                    } else {
                      vErrors.push(err25);
                    }
                    errors++;
                  }
                  if (typeof data10 == "number" && isFinite(data10)) {
                    if (data10 > 9007199254740991 || isNaN(data10)) {
                      const err26 = { instancePath: instancePath + "/window/" + i2 + "/messageCount", schemaPath: "#/definitions/BrowserActivityRunWindow/properties/messageCount/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                      if (vErrors === null) {
                        vErrors = [err26];
                      } else {
                        vErrors.push(err26);
                      }
                      errors++;
                    }
                    if (data10 < 0 || isNaN(data10)) {
                      const err27 = { instancePath: instancePath + "/window/" + i2 + "/messageCount", schemaPath: "#/definitions/BrowserActivityRunWindow/properties/messageCount/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                      if (vErrors === null) {
                        vErrors = [err27];
                      } else {
                        vErrors.push(err27);
                      }
                      errors++;
                    }
                  }
                }
                if (data8.throughMessageId !== void 0) {
                  let data11 = data8.throughMessageId;
                  if (typeof data11 === "string") {
                    if (!pattern0.test(data11)) {
                      const err28 = { instancePath: instancePath + "/window/" + i2 + "/throughMessageId", schemaPath: "#/definitions/BrowserActivityRunWindow/properties/throughMessageId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err28];
                      } else {
                        vErrors.push(err28);
                      }
                      errors++;
                    }
                  } else {
                    const err29 = { instancePath: instancePath + "/window/" + i2 + "/throughMessageId", schemaPath: "#/definitions/BrowserActivityRunWindow/properties/throughMessageId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err29];
                    } else {
                      vErrors.push(err29);
                    }
                    errors++;
                  }
                }
                if (data8.committedThroughSequence !== void 0) {
                  let data12 = data8.committedThroughSequence;
                  if (!(typeof data12 == "number" && (!(data12 % 1) && !isNaN(data12)) && isFinite(data12))) {
                    const err30 = { instancePath: instancePath + "/window/" + i2 + "/committedThroughSequence", schemaPath: "#/definitions/BrowserActivityRunWindow/properties/committedThroughSequence/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                    if (vErrors === null) {
                      vErrors = [err30];
                    } else {
                      vErrors.push(err30);
                    }
                    errors++;
                  }
                  if (typeof data12 == "number" && isFinite(data12)) {
                    if (data12 > 9007199254740991 || isNaN(data12)) {
                      const err31 = { instancePath: instancePath + "/window/" + i2 + "/committedThroughSequence", schemaPath: "#/definitions/BrowserActivityRunWindow/properties/committedThroughSequence/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                      if (vErrors === null) {
                        vErrors = [err31];
                      } else {
                        vErrors.push(err31);
                      }
                      errors++;
                    }
                    if (data12 < 0 || isNaN(data12)) {
                      const err32 = { instancePath: instancePath + "/window/" + i2 + "/committedThroughSequence", schemaPath: "#/definitions/BrowserActivityRunWindow/properties/committedThroughSequence/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                      if (vErrors === null) {
                        vErrors = [err32];
                      } else {
                        vErrors.push(err32);
                      }
                      errors++;
                    }
                  }
                }
              } else {
                const err33 = { instancePath: instancePath + "/window/" + i2, schemaPath: "#/definitions/BrowserActivityRunWindow/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err33];
                } else {
                  vErrors.push(err33);
                }
                errors++;
              }
            }
          } else {
            const err34 = { instancePath: instancePath + "/window", schemaPath: "#/properties/window/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err34];
            } else {
              vErrors.push(err34);
            }
            errors++;
          }
        }
        if (data.gaps !== void 0) {
          let data13 = data.gaps;
          if (Array.isArray(data13)) {
            if (data13.length > 2) {
              const err35 = { instancePath: instancePath + "/gaps", schemaPath: "#/properties/gaps/maxItems", keyword: "maxItems", params: { limit: 2 }, message: "must NOT have more than 2 items" };
              if (vErrors === null) {
                vErrors = [err35];
              } else {
                vErrors.push(err35);
              }
              errors++;
            }
            const len3 = data13.length;
            for (let i3 = 0; i3 < len3; i3++) {
              if (!validate24(data13[i3], { instancePath: instancePath + "/gaps/" + i3, parentData: data13, parentDataProperty: i3, rootData })) {
                vErrors = vErrors === null ? validate24.errors : vErrors.concat(validate24.errors);
                errors = vErrors.length;
              }
            }
          } else {
            const err36 = { instancePath: instancePath + "/gaps", schemaPath: "#/properties/gaps/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err36];
            } else {
              vErrors.push(err36);
            }
            errors++;
          }
        }
        if (data.range !== void 0) {
          if (!validate26(data.range, { instancePath: instancePath + "/range", parentData: data, parentDataProperty: "range", rootData })) {
            vErrors = vErrors === null ? validate26.errors : vErrors.concat(validate26.errors);
            errors = vErrors.length;
          }
        }
        if (data.stages !== void 0) {
          let data16 = data.stages;
          if (Array.isArray(data16)) {
            const len4 = data16.length;
            for (let i4 = 0; i4 < len4; i4++) {
              let data17 = data16[i4];
              if (data17 && typeof data17 == "object" && !Array.isArray(data17)) {
                if (data17.runId === void 0) {
                  const err37 = { instancePath: instancePath + "/stages/" + i4, schemaPath: "#/definitions/BrowserActivityStageContext/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
                  if (vErrors === null) {
                    vErrors = [err37];
                  } else {
                    vErrors.push(err37);
                  }
                  errors++;
                }
                if (data17.stageId === void 0) {
                  const err38 = { instancePath: instancePath + "/stages/" + i4, schemaPath: "#/definitions/BrowserActivityStageContext/required", keyword: "required", params: { missingProperty: "stageId" }, message: "must have required property 'stageId'" };
                  if (vErrors === null) {
                    vErrors = [err38];
                  } else {
                    vErrors.push(err38);
                  }
                  errors++;
                }
                if (data17.revision === void 0) {
                  const err39 = { instancePath: instancePath + "/stages/" + i4, schemaPath: "#/definitions/BrowserActivityStageContext/required", keyword: "required", params: { missingProperty: "revision" }, message: "must have required property 'revision'" };
                  if (vErrors === null) {
                    vErrors = [err39];
                  } else {
                    vErrors.push(err39);
                  }
                  errors++;
                }
                if (data17.status === void 0) {
                  const err40 = { instancePath: instancePath + "/stages/" + i4, schemaPath: "#/definitions/BrowserActivityStageContext/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
                  if (vErrors === null) {
                    vErrors = [err40];
                  } else {
                    vErrors.push(err40);
                  }
                  errors++;
                }
                if (data17.firstSequence === void 0) {
                  const err41 = { instancePath: instancePath + "/stages/" + i4, schemaPath: "#/definitions/BrowserActivityStageContext/required", keyword: "required", params: { missingProperty: "firstSequence" }, message: "must have required property 'firstSequence'" };
                  if (vErrors === null) {
                    vErrors = [err41];
                  } else {
                    vErrors.push(err41);
                  }
                  errors++;
                }
                if (data17.completeWithinPage === void 0) {
                  const err42 = { instancePath: instancePath + "/stages/" + i4, schemaPath: "#/definitions/BrowserActivityStageContext/required", keyword: "required", params: { missingProperty: "completeWithinPage" }, message: "must have required property 'completeWithinPage'" };
                  if (vErrors === null) {
                    vErrors = [err42];
                  } else {
                    vErrors.push(err42);
                  }
                  errors++;
                }
                for (const key2 in data17) {
                  if (!(key2 === "runId" || key2 === "stageId" || key2 === "revision" || key2 === "status" || key2 === "target" || key2 === "firstSequence" || key2 === "lastSequence" || key2 === "completeWithinPage")) {
                    const err43 = { instancePath: instancePath + "/stages/" + i4, schemaPath: "#/definitions/BrowserActivityStageContext/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err43];
                    } else {
                      vErrors.push(err43);
                    }
                    errors++;
                  }
                }
                if (data17.runId !== void 0) {
                  let data18 = data17.runId;
                  if (typeof data18 === "string") {
                    if (!pattern0.test(data18)) {
                      const err44 = { instancePath: instancePath + "/stages/" + i4 + "/runId", schemaPath: "#/definitions/BrowserActivityStageContext/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err44];
                      } else {
                        vErrors.push(err44);
                      }
                      errors++;
                    }
                  } else {
                    const err45 = { instancePath: instancePath + "/stages/" + i4 + "/runId", schemaPath: "#/definitions/BrowserActivityStageContext/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err45];
                    } else {
                      vErrors.push(err45);
                    }
                    errors++;
                  }
                }
                if (data17.stageId !== void 0) {
                  let data19 = data17.stageId;
                  if (typeof data19 === "string") {
                    if (!pattern0.test(data19)) {
                      const err46 = { instancePath: instancePath + "/stages/" + i4 + "/stageId", schemaPath: "#/definitions/BrowserActivityStageContext/properties/stageId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err46];
                      } else {
                        vErrors.push(err46);
                      }
                      errors++;
                    }
                  } else {
                    const err47 = { instancePath: instancePath + "/stages/" + i4 + "/stageId", schemaPath: "#/definitions/BrowserActivityStageContext/properties/stageId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err47];
                    } else {
                      vErrors.push(err47);
                    }
                    errors++;
                  }
                }
                if (data17.revision !== void 0) {
                  let data20 = data17.revision;
                  if (!(typeof data20 == "number" && (!(data20 % 1) && !isNaN(data20)) && isFinite(data20))) {
                    const err48 = { instancePath: instancePath + "/stages/" + i4 + "/revision", schemaPath: "#/definitions/BrowserActivityStageContext/properties/revision/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                    if (vErrors === null) {
                      vErrors = [err48];
                    } else {
                      vErrors.push(err48);
                    }
                    errors++;
                  }
                  if (typeof data20 == "number" && isFinite(data20)) {
                    if (data20 > 9007199254740991 || isNaN(data20)) {
                      const err49 = { instancePath: instancePath + "/stages/" + i4 + "/revision", schemaPath: "#/definitions/BrowserActivityStageContext/properties/revision/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                      if (vErrors === null) {
                        vErrors = [err49];
                      } else {
                        vErrors.push(err49);
                      }
                      errors++;
                    }
                    if (data20 < 1 || isNaN(data20)) {
                      const err50 = { instancePath: instancePath + "/stages/" + i4 + "/revision", schemaPath: "#/definitions/BrowserActivityStageContext/properties/revision/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
                      if (vErrors === null) {
                        vErrors = [err50];
                      } else {
                        vErrors.push(err50);
                      }
                      errors++;
                    }
                  }
                }
                if (data17.status !== void 0) {
                  let data21 = data17.status;
                  if (typeof data21 !== "string") {
                    const err51 = { instancePath: instancePath + "/stages/" + i4 + "/status", schemaPath: "#/definitions/BrowserActivityStageContext/properties/status/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err51];
                    } else {
                      vErrors.push(err51);
                    }
                    errors++;
                  }
                  if (!(data21 === "executing" || data21 === "accepted" || data21 === "rejected")) {
                    const err52 = { instancePath: instancePath + "/stages/" + i4 + "/status", schemaPath: "#/definitions/BrowserActivityStageContext/properties/status/enum", keyword: "enum", params: { allowedValues: schema34.properties.status.enum }, message: "must be equal to one of the allowed values" };
                    if (vErrors === null) {
                      vErrors = [err52];
                    } else {
                      vErrors.push(err52);
                    }
                    errors++;
                  }
                }
                if (data17.target !== void 0) {
                  if (typeof data17.target !== "string") {
                    const err53 = { instancePath: instancePath + "/stages/" + i4 + "/target", schemaPath: "#/definitions/BrowserActivityStageContext/properties/target/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err53];
                    } else {
                      vErrors.push(err53);
                    }
                    errors++;
                  }
                }
                if (data17.firstSequence !== void 0) {
                  let data23 = data17.firstSequence;
                  if (!(typeof data23 == "number" && (!(data23 % 1) && !isNaN(data23)) && isFinite(data23))) {
                    const err54 = { instancePath: instancePath + "/stages/" + i4 + "/firstSequence", schemaPath: "#/definitions/BrowserActivityStageContext/properties/firstSequence/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                    if (vErrors === null) {
                      vErrors = [err54];
                    } else {
                      vErrors.push(err54);
                    }
                    errors++;
                  }
                  if (typeof data23 == "number" && isFinite(data23)) {
                    if (data23 > 9007199254740991 || isNaN(data23)) {
                      const err55 = { instancePath: instancePath + "/stages/" + i4 + "/firstSequence", schemaPath: "#/definitions/BrowserActivityStageContext/properties/firstSequence/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                      if (vErrors === null) {
                        vErrors = [err55];
                      } else {
                        vErrors.push(err55);
                      }
                      errors++;
                    }
                    if (data23 < 0 || isNaN(data23)) {
                      const err56 = { instancePath: instancePath + "/stages/" + i4 + "/firstSequence", schemaPath: "#/definitions/BrowserActivityStageContext/properties/firstSequence/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                      if (vErrors === null) {
                        vErrors = [err56];
                      } else {
                        vErrors.push(err56);
                      }
                      errors++;
                    }
                  }
                }
                if (data17.lastSequence !== void 0) {
                  let data24 = data17.lastSequence;
                  if (!(typeof data24 == "number" && (!(data24 % 1) && !isNaN(data24)) && isFinite(data24))) {
                    const err57 = { instancePath: instancePath + "/stages/" + i4 + "/lastSequence", schemaPath: "#/definitions/BrowserActivityStageContext/properties/lastSequence/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                    if (vErrors === null) {
                      vErrors = [err57];
                    } else {
                      vErrors.push(err57);
                    }
                    errors++;
                  }
                  if (typeof data24 == "number" && isFinite(data24)) {
                    if (data24 > 9007199254740991 || isNaN(data24)) {
                      const err58 = { instancePath: instancePath + "/stages/" + i4 + "/lastSequence", schemaPath: "#/definitions/BrowserActivityStageContext/properties/lastSequence/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                      if (vErrors === null) {
                        vErrors = [err58];
                      } else {
                        vErrors.push(err58);
                      }
                      errors++;
                    }
                    if (data24 < 0 || isNaN(data24)) {
                      const err59 = { instancePath: instancePath + "/stages/" + i4 + "/lastSequence", schemaPath: "#/definitions/BrowserActivityStageContext/properties/lastSequence/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                      if (vErrors === null) {
                        vErrors = [err59];
                      } else {
                        vErrors.push(err59);
                      }
                      errors++;
                    }
                  }
                }
                if (data17.completeWithinPage !== void 0) {
                  if (typeof data17.completeWithinPage !== "boolean") {
                    const err60 = { instancePath: instancePath + "/stages/" + i4 + "/completeWithinPage", schemaPath: "#/definitions/BrowserActivityStageContext/properties/completeWithinPage/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                    if (vErrors === null) {
                      vErrors = [err60];
                    } else {
                      vErrors.push(err60);
                    }
                    errors++;
                  }
                }
              } else {
                const err61 = { instancePath: instancePath + "/stages/" + i4, schemaPath: "#/definitions/BrowserActivityStageContext/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err61];
                } else {
                  vErrors.push(err61);
                }
                errors++;
              }
            }
          } else {
            const err62 = { instancePath: instancePath + "/stages", schemaPath: "#/properties/stages/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err62];
            } else {
              vErrors.push(err62);
            }
            errors++;
          }
        }
        if (data.actionGroups !== void 0) {
          let data26 = data.actionGroups;
          if (Array.isArray(data26)) {
            const len5 = data26.length;
            for (let i5 = 0; i5 < len5; i5++) {
              let data27 = data26[i5];
              if (data27 && typeof data27 == "object" && !Array.isArray(data27)) {
                if (data27.runId === void 0) {
                  const err63 = { instancePath: instancePath + "/actionGroups/" + i5, schemaPath: "#/definitions/BrowserActivityActionContext/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
                  if (vErrors === null) {
                    vErrors = [err63];
                  } else {
                    vErrors.push(err63);
                  }
                  errors++;
                }
                if (data27.actionId === void 0) {
                  const err64 = { instancePath: instancePath + "/actionGroups/" + i5, schemaPath: "#/definitions/BrowserActivityActionContext/required", keyword: "required", params: { missingProperty: "actionId" }, message: "must have required property 'actionId'" };
                  if (vErrors === null) {
                    vErrors = [err64];
                  } else {
                    vErrors.push(err64);
                  }
                  errors++;
                }
                if (data27.firstSequence === void 0) {
                  const err65 = { instancePath: instancePath + "/actionGroups/" + i5, schemaPath: "#/definitions/BrowserActivityActionContext/required", keyword: "required", params: { missingProperty: "firstSequence" }, message: "must have required property 'firstSequence'" };
                  if (vErrors === null) {
                    vErrors = [err65];
                  } else {
                    vErrors.push(err65);
                  }
                  errors++;
                }
                if (data27.lastSequence === void 0) {
                  const err66 = { instancePath: instancePath + "/actionGroups/" + i5, schemaPath: "#/definitions/BrowserActivityActionContext/required", keyword: "required", params: { missingProperty: "lastSequence" }, message: "must have required property 'lastSequence'" };
                  if (vErrors === null) {
                    vErrors = [err66];
                  } else {
                    vErrors.push(err66);
                  }
                  errors++;
                }
                if (data27.completeWithinPage === void 0) {
                  const err67 = { instancePath: instancePath + "/actionGroups/" + i5, schemaPath: "#/definitions/BrowserActivityActionContext/required", keyword: "required", params: { missingProperty: "completeWithinPage" }, message: "must have required property 'completeWithinPage'" };
                  if (vErrors === null) {
                    vErrors = [err67];
                  } else {
                    vErrors.push(err67);
                  }
                  errors++;
                }
                for (const key3 in data27) {
                  if (!(key3 === "runId" || key3 === "actionId" || key3 === "firstSequence" || key3 === "lastSequence" || key3 === "completeWithinPage")) {
                    const err68 = { instancePath: instancePath + "/actionGroups/" + i5, schemaPath: "#/definitions/BrowserActivityActionContext/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err68];
                    } else {
                      vErrors.push(err68);
                    }
                    errors++;
                  }
                }
                if (data27.runId !== void 0) {
                  let data28 = data27.runId;
                  if (typeof data28 === "string") {
                    if (!pattern0.test(data28)) {
                      const err69 = { instancePath: instancePath + "/actionGroups/" + i5 + "/runId", schemaPath: "#/definitions/BrowserActivityActionContext/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err69];
                      } else {
                        vErrors.push(err69);
                      }
                      errors++;
                    }
                  } else {
                    const err70 = { instancePath: instancePath + "/actionGroups/" + i5 + "/runId", schemaPath: "#/definitions/BrowserActivityActionContext/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err70];
                    } else {
                      vErrors.push(err70);
                    }
                    errors++;
                  }
                }
                if (data27.actionId !== void 0) {
                  let data29 = data27.actionId;
                  if (typeof data29 === "string") {
                    if (!pattern0.test(data29)) {
                      const err71 = { instancePath: instancePath + "/actionGroups/" + i5 + "/actionId", schemaPath: "#/definitions/BrowserActivityActionContext/properties/actionId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err71];
                      } else {
                        vErrors.push(err71);
                      }
                      errors++;
                    }
                  } else {
                    const err72 = { instancePath: instancePath + "/actionGroups/" + i5 + "/actionId", schemaPath: "#/definitions/BrowserActivityActionContext/properties/actionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err72];
                    } else {
                      vErrors.push(err72);
                    }
                    errors++;
                  }
                }
                if (data27.firstSequence !== void 0) {
                  let data30 = data27.firstSequence;
                  if (!(typeof data30 == "number" && (!(data30 % 1) && !isNaN(data30)) && isFinite(data30))) {
                    const err73 = { instancePath: instancePath + "/actionGroups/" + i5 + "/firstSequence", schemaPath: "#/definitions/BrowserActivityActionContext/properties/firstSequence/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                    if (vErrors === null) {
                      vErrors = [err73];
                    } else {
                      vErrors.push(err73);
                    }
                    errors++;
                  }
                  if (typeof data30 == "number" && isFinite(data30)) {
                    if (data30 > 9007199254740991 || isNaN(data30)) {
                      const err74 = { instancePath: instancePath + "/actionGroups/" + i5 + "/firstSequence", schemaPath: "#/definitions/BrowserActivityActionContext/properties/firstSequence/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                      if (vErrors === null) {
                        vErrors = [err74];
                      } else {
                        vErrors.push(err74);
                      }
                      errors++;
                    }
                    if (data30 < 0 || isNaN(data30)) {
                      const err75 = { instancePath: instancePath + "/actionGroups/" + i5 + "/firstSequence", schemaPath: "#/definitions/BrowserActivityActionContext/properties/firstSequence/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                      if (vErrors === null) {
                        vErrors = [err75];
                      } else {
                        vErrors.push(err75);
                      }
                      errors++;
                    }
                  }
                }
                if (data27.lastSequence !== void 0) {
                  let data31 = data27.lastSequence;
                  if (!(typeof data31 == "number" && (!(data31 % 1) && !isNaN(data31)) && isFinite(data31))) {
                    const err76 = { instancePath: instancePath + "/actionGroups/" + i5 + "/lastSequence", schemaPath: "#/definitions/BrowserActivityActionContext/properties/lastSequence/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                    if (vErrors === null) {
                      vErrors = [err76];
                    } else {
                      vErrors.push(err76);
                    }
                    errors++;
                  }
                  if (typeof data31 == "number" && isFinite(data31)) {
                    if (data31 > 9007199254740991 || isNaN(data31)) {
                      const err77 = { instancePath: instancePath + "/actionGroups/" + i5 + "/lastSequence", schemaPath: "#/definitions/BrowserActivityActionContext/properties/lastSequence/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                      if (vErrors === null) {
                        vErrors = [err77];
                      } else {
                        vErrors.push(err77);
                      }
                      errors++;
                    }
                    if (data31 < 0 || isNaN(data31)) {
                      const err78 = { instancePath: instancePath + "/actionGroups/" + i5 + "/lastSequence", schemaPath: "#/definitions/BrowserActivityActionContext/properties/lastSequence/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                      if (vErrors === null) {
                        vErrors = [err78];
                      } else {
                        vErrors.push(err78);
                      }
                      errors++;
                    }
                  }
                }
                if (data27.completeWithinPage !== void 0) {
                  if (typeof data27.completeWithinPage !== "boolean") {
                    const err79 = { instancePath: instancePath + "/actionGroups/" + i5 + "/completeWithinPage", schemaPath: "#/definitions/BrowserActivityActionContext/properties/completeWithinPage/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                    if (vErrors === null) {
                      vErrors = [err79];
                    } else {
                      vErrors.push(err79);
                    }
                    errors++;
                  }
                }
              } else {
                const err80 = { instancePath: instancePath + "/actionGroups/" + i5, schemaPath: "#/definitions/BrowserActivityActionContext/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err80];
                } else {
                  vErrors.push(err80);
                }
                errors++;
              }
            }
          } else {
            const err81 = { instancePath: instancePath + "/actionGroups", schemaPath: "#/properties/actionGroups/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err81];
            } else {
              vErrors.push(err81);
            }
            errors++;
          }
        }
        if (data.beforeCursor !== void 0) {
          let data33 = data.beforeCursor;
          if (typeof data33 === "string") {
            if (!pattern36.test(data33)) {
              const err82 = { instancePath: instancePath + "/beforeCursor", schemaPath: "#/properties/beforeCursor/pattern", keyword: "pattern", params: { pattern: "^[A-Za-z0-9_-]+$" }, message: 'must match pattern "^[A-Za-z0-9_-]+$"' };
              if (vErrors === null) {
                vErrors = [err82];
              } else {
                vErrors.push(err82);
              }
              errors++;
            }
          } else {
            const err83 = { instancePath: instancePath + "/beforeCursor", schemaPath: "#/properties/beforeCursor/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err83];
            } else {
              vErrors.push(err83);
            }
            errors++;
          }
        }
        if (data.afterCursor !== void 0) {
          let data34 = data.afterCursor;
          if (typeof data34 === "string") {
            if (!pattern36.test(data34)) {
              const err84 = { instancePath: instancePath + "/afterCursor", schemaPath: "#/properties/afterCursor/pattern", keyword: "pattern", params: { pattern: "^[A-Za-z0-9_-]+$" }, message: 'must match pattern "^[A-Za-z0-9_-]+$"' };
              if (vErrors === null) {
                vErrors = [err84];
              } else {
                vErrors.push(err84);
              }
              errors++;
            }
          } else {
            const err85 = { instancePath: instancePath + "/afterCursor", schemaPath: "#/properties/afterCursor/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err85];
            } else {
              vErrors.push(err85);
            }
            errors++;
          }
        }
      } else {
        const err86 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err86];
        } else {
          vErrors.push(err86);
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
export default require_BrowserActivityPage_validator();
