var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// BrowserActionReviewResult-validator.cjs
var require_BrowserActionReviewResult_validator = __commonJS({
  "BrowserActionReviewResult-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema12 = { "anyOf": [{ "type": "object", "properties": { "ok": { "type": "boolean", "const": true }, "goalId": { "type": "string", "pattern": "\\S" }, "runId": { "type": "string", "pattern": "\\S" }, "review": { "$ref": "#/definitions/BrowserActionReview" } }, "required": ["ok", "goalId", "runId", "review"], "additionalProperties": false }, { "type": "object", "properties": { "ok": { "type": "boolean", "const": false }, "error": { "type": "string", "enum": ["goal_not_found", "stale_run", "action_not_waiting", "action_id_mismatch", "tool_not_found", "invalid_tool_input", "scope_unavailable", "sandbox_scope_unavailable", "review_unavailable"] }, "issues": { "type": "array", "items": { "$ref": "#/definitions/BrowserActionReviewIssue" } } }, "required": ["ok", "error"], "additionalProperties": false }], "description": "\u53EA\u8BFB\u5BA1\u6279\u9884\u68C0\u7684 wire \u7ED3\u679C\u3002" };
    var schema18 = { "type": "object", "properties": { "path": { "type": "array", "items": { "type": ["string", "number"] } }, "message": { "type": "string" } }, "required": ["path", "message"], "additionalProperties": false, "description": "\u53EF\u5B9A\u4F4D\u7684\u5B57\u6BB5\u7EA7\u95EE\u9898\u3002" };
    var pattern0 = new RegExp("\\S", "u");
    var schema13 = { "type": "object", "properties": { "actionId": { "type": "string", "pattern": "\\S" }, "toolId": { "type": "string", "pattern": "\\S" }, "originalInput": {}, "finalInput": {}, "changed": { "type": "boolean" }, "scope": { "$ref": "#/definitions/BrowserActionReviewScope" }, "availableScopes": { "type": "array", "items": { "$ref": "#/definitions/BrowserActionReviewScope" } }, "capability": { "$ref": "#/definitions/BrowserActionCapability" }, "requiresSandboxApproval": { "type": "boolean" }, "reviewRef": { "type": "string", "pattern": "\\S" } }, "required": ["actionId", "toolId", "originalInput", "finalInput", "changed", "scope", "availableScopes", "capability", "requiresSandboxApproval", "reviewRef"], "additionalProperties": false, "description": "\u53EA\u8BFB\u5BA1\u6279\u9884\u68C0\u8FD4\u56DE\u7684\u53EF\u5BA1\u9605\u5185\u5BB9\u3002" };
    var schema14 = { "type": "string", "enum": ["action", "goal", "workspace"], "description": "Action \u5BA1\u9605\u53EF\u7533\u8BF7\u7684\u6388\u6743\u671F\u9650\u3002" };
    var func2 = Object.prototype.hasOwnProperty;
    var schema16 = { "type": "object", "properties": { "network": { "type": "string", "enum": ["none", "all_outbound"] }, "extraFiles": { "type": "array", "items": { "$ref": "#/definitions/BrowserPermissionExtraFile" } }, "targetPaths": { "type": "array", "items": { "type": "string" } } }, "required": ["network", "extraFiles", "targetPaths"], "additionalProperties": false, "description": "\u91CD\u65B0\u8BA1\u7B97\u51FA\u7684\u5B9E\u9645\u80FD\u529B\u8303\u56F4\u3002" };
    var schema17 = { "type": "object", "properties": { "canonicalPath": { "type": "string", "pattern": "\\S" }, "access": { "type": "string", "enum": ["read", "write"] }, "kind": { "type": "string", "enum": ["file", "directory_tree"] } }, "required": ["canonicalPath", "access", "kind"], "additionalProperties": false, "description": "\u6743\u9650\u8FB9\u754C\u4E2D\u7684\u5355\u4E2A\u5916\u90E8\u6587\u4EF6/\u76EE\u5F55\u6761\u76EE\u3002" };
    function validate13(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.network === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "network" }, message: "must have required property 'network'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.extraFiles === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "extraFiles" }, message: "must have required property 'extraFiles'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.targetPaths === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "targetPaths" }, message: "must have required property 'targetPaths'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "network" || key0 === "extraFiles" || key0 === "targetPaths")) {
            const err3 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.network !== void 0) {
          let data0 = data.network;
          if (typeof data0 !== "string") {
            const err4 = { instancePath: instancePath + "/network", schemaPath: "#/properties/network/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
          if (!(data0 === "none" || data0 === "all_outbound")) {
            const err5 = { instancePath: instancePath + "/network", schemaPath: "#/properties/network/enum", keyword: "enum", params: { allowedValues: schema16.properties.network.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.extraFiles !== void 0) {
          let data1 = data.extraFiles;
          if (Array.isArray(data1)) {
            const len0 = data1.length;
            for (let i0 = 0; i0 < len0; i0++) {
              let data2 = data1[i0];
              if (data2 && typeof data2 == "object" && !Array.isArray(data2)) {
                if (data2.canonicalPath === void 0) {
                  const err6 = { instancePath: instancePath + "/extraFiles/" + i0, schemaPath: "#/definitions/BrowserPermissionExtraFile/required", keyword: "required", params: { missingProperty: "canonicalPath" }, message: "must have required property 'canonicalPath'" };
                  if (vErrors === null) {
                    vErrors = [err6];
                  } else {
                    vErrors.push(err6);
                  }
                  errors++;
                }
                if (data2.access === void 0) {
                  const err7 = { instancePath: instancePath + "/extraFiles/" + i0, schemaPath: "#/definitions/BrowserPermissionExtraFile/required", keyword: "required", params: { missingProperty: "access" }, message: "must have required property 'access'" };
                  if (vErrors === null) {
                    vErrors = [err7];
                  } else {
                    vErrors.push(err7);
                  }
                  errors++;
                }
                if (data2.kind === void 0) {
                  const err8 = { instancePath: instancePath + "/extraFiles/" + i0, schemaPath: "#/definitions/BrowserPermissionExtraFile/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                  if (vErrors === null) {
                    vErrors = [err8];
                  } else {
                    vErrors.push(err8);
                  }
                  errors++;
                }
                for (const key1 in data2) {
                  if (!(key1 === "canonicalPath" || key1 === "access" || key1 === "kind")) {
                    const err9 = { instancePath: instancePath + "/extraFiles/" + i0, schemaPath: "#/definitions/BrowserPermissionExtraFile/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err9];
                    } else {
                      vErrors.push(err9);
                    }
                    errors++;
                  }
                }
                if (data2.canonicalPath !== void 0) {
                  let data3 = data2.canonicalPath;
                  if (typeof data3 === "string") {
                    if (!pattern0.test(data3)) {
                      const err10 = { instancePath: instancePath + "/extraFiles/" + i0 + "/canonicalPath", schemaPath: "#/definitions/BrowserPermissionExtraFile/properties/canonicalPath/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
                      if (vErrors === null) {
                        vErrors = [err10];
                      } else {
                        vErrors.push(err10);
                      }
                      errors++;
                    }
                  } else {
                    const err11 = { instancePath: instancePath + "/extraFiles/" + i0 + "/canonicalPath", schemaPath: "#/definitions/BrowserPermissionExtraFile/properties/canonicalPath/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err11];
                    } else {
                      vErrors.push(err11);
                    }
                    errors++;
                  }
                }
                if (data2.access !== void 0) {
                  let data4 = data2.access;
                  if (typeof data4 !== "string") {
                    const err12 = { instancePath: instancePath + "/extraFiles/" + i0 + "/access", schemaPath: "#/definitions/BrowserPermissionExtraFile/properties/access/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err12];
                    } else {
                      vErrors.push(err12);
                    }
                    errors++;
                  }
                  if (!(data4 === "read" || data4 === "write")) {
                    const err13 = { instancePath: instancePath + "/extraFiles/" + i0 + "/access", schemaPath: "#/definitions/BrowserPermissionExtraFile/properties/access/enum", keyword: "enum", params: { allowedValues: schema17.properties.access.enum }, message: "must be equal to one of the allowed values" };
                    if (vErrors === null) {
                      vErrors = [err13];
                    } else {
                      vErrors.push(err13);
                    }
                    errors++;
                  }
                }
                if (data2.kind !== void 0) {
                  let data5 = data2.kind;
                  if (typeof data5 !== "string") {
                    const err14 = { instancePath: instancePath + "/extraFiles/" + i0 + "/kind", schemaPath: "#/definitions/BrowserPermissionExtraFile/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err14];
                    } else {
                      vErrors.push(err14);
                    }
                    errors++;
                  }
                  if (!(data5 === "file" || data5 === "directory_tree")) {
                    const err15 = { instancePath: instancePath + "/extraFiles/" + i0 + "/kind", schemaPath: "#/definitions/BrowserPermissionExtraFile/properties/kind/enum", keyword: "enum", params: { allowedValues: schema17.properties.kind.enum }, message: "must be equal to one of the allowed values" };
                    if (vErrors === null) {
                      vErrors = [err15];
                    } else {
                      vErrors.push(err15);
                    }
                    errors++;
                  }
                }
              } else {
                const err16 = { instancePath: instancePath + "/extraFiles/" + i0, schemaPath: "#/definitions/BrowserPermissionExtraFile/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err16];
                } else {
                  vErrors.push(err16);
                }
                errors++;
              }
            }
          } else {
            const err17 = { instancePath: instancePath + "/extraFiles", schemaPath: "#/properties/extraFiles/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err17];
            } else {
              vErrors.push(err17);
            }
            errors++;
          }
        }
        if (data.targetPaths !== void 0) {
          let data6 = data.targetPaths;
          if (Array.isArray(data6)) {
            const len1 = data6.length;
            for (let i1 = 0; i1 < len1; i1++) {
              if (typeof data6[i1] !== "string") {
                const err18 = { instancePath: instancePath + "/targetPaths/" + i1, schemaPath: "#/properties/targetPaths/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err18];
                } else {
                  vErrors.push(err18);
                }
                errors++;
              }
            }
          } else {
            const err19 = { instancePath: instancePath + "/targetPaths", schemaPath: "#/properties/targetPaths/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err19];
            } else {
              vErrors.push(err19);
            }
            errors++;
          }
        }
      } else {
        const err20 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
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
        if (data.actionId === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "actionId" }, message: "must have required property 'actionId'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.toolId === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "toolId" }, message: "must have required property 'toolId'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.originalInput === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "originalInput" }, message: "must have required property 'originalInput'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.finalInput === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "finalInput" }, message: "must have required property 'finalInput'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.changed === void 0) {
          const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "changed" }, message: "must have required property 'changed'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        if (data.scope === void 0) {
          const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "scope" }, message: "must have required property 'scope'" };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        if (data.availableScopes === void 0) {
          const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "availableScopes" }, message: "must have required property 'availableScopes'" };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
        if (data.capability === void 0) {
          const err7 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "capability" }, message: "must have required property 'capability'" };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
        if (data.requiresSandboxApproval === void 0) {
          const err8 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "requiresSandboxApproval" }, message: "must have required property 'requiresSandboxApproval'" };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
        if (data.reviewRef === void 0) {
          const err9 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "reviewRef" }, message: "must have required property 'reviewRef'" };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!func2.call(schema13.properties, key0)) {
            const err10 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data.actionId !== void 0) {
          let data0 = data.actionId;
          if (typeof data0 === "string") {
            if (!pattern0.test(data0)) {
              const err11 = { instancePath: instancePath + "/actionId", schemaPath: "#/properties/actionId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err11];
              } else {
                vErrors.push(err11);
              }
              errors++;
            }
          } else {
            const err12 = { instancePath: instancePath + "/actionId", schemaPath: "#/properties/actionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
        }
        if (data.toolId !== void 0) {
          let data1 = data.toolId;
          if (typeof data1 === "string") {
            if (!pattern0.test(data1)) {
              const err13 = { instancePath: instancePath + "/toolId", schemaPath: "#/properties/toolId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
          } else {
            const err14 = { instancePath: instancePath + "/toolId", schemaPath: "#/properties/toolId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
        }
        if (data.changed !== void 0) {
          if (typeof data.changed !== "boolean") {
            const err15 = { instancePath: instancePath + "/changed", schemaPath: "#/properties/changed/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
        }
        if (data.scope !== void 0) {
          let data3 = data.scope;
          if (typeof data3 !== "string") {
            const err16 = { instancePath: instancePath + "/scope", schemaPath: "#/definitions/BrowserActionReviewScope/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err16];
            } else {
              vErrors.push(err16);
            }
            errors++;
          }
          if (!(data3 === "action" || data3 === "goal" || data3 === "workspace")) {
            const err17 = { instancePath: instancePath + "/scope", schemaPath: "#/definitions/BrowserActionReviewScope/enum", keyword: "enum", params: { allowedValues: schema14.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err17];
            } else {
              vErrors.push(err17);
            }
            errors++;
          }
        }
        if (data.availableScopes !== void 0) {
          let data4 = data.availableScopes;
          if (Array.isArray(data4)) {
            const len0 = data4.length;
            for (let i0 = 0; i0 < len0; i0++) {
              let data5 = data4[i0];
              if (typeof data5 !== "string") {
                const err18 = { instancePath: instancePath + "/availableScopes/" + i0, schemaPath: "#/definitions/BrowserActionReviewScope/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err18];
                } else {
                  vErrors.push(err18);
                }
                errors++;
              }
              if (!(data5 === "action" || data5 === "goal" || data5 === "workspace")) {
                const err19 = { instancePath: instancePath + "/availableScopes/" + i0, schemaPath: "#/definitions/BrowserActionReviewScope/enum", keyword: "enum", params: { allowedValues: schema14.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err19];
                } else {
                  vErrors.push(err19);
                }
                errors++;
              }
            }
          } else {
            const err20 = { instancePath: instancePath + "/availableScopes", schemaPath: "#/properties/availableScopes/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err20];
            } else {
              vErrors.push(err20);
            }
            errors++;
          }
        }
        if (data.capability !== void 0) {
          if (!validate13(data.capability, { instancePath: instancePath + "/capability", parentData: data, parentDataProperty: "capability", rootData })) {
            vErrors = vErrors === null ? validate13.errors : vErrors.concat(validate13.errors);
            errors = vErrors.length;
          }
        }
        if (data.requiresSandboxApproval !== void 0) {
          if (typeof data.requiresSandboxApproval !== "boolean") {
            const err21 = { instancePath: instancePath + "/requiresSandboxApproval", schemaPath: "#/properties/requiresSandboxApproval/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err21];
            } else {
              vErrors.push(err21);
            }
            errors++;
          }
        }
        if (data.reviewRef !== void 0) {
          let data8 = data.reviewRef;
          if (typeof data8 === "string") {
            if (!pattern0.test(data8)) {
              const err22 = { instancePath: instancePath + "/reviewRef", schemaPath: "#/properties/reviewRef/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err22];
              } else {
                vErrors.push(err22);
              }
              errors++;
            }
          } else {
            const err23 = { instancePath: instancePath + "/reviewRef", schemaPath: "#/properties/reviewRef/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err23];
            } else {
              vErrors.push(err23);
            }
            errors++;
          }
        }
      } else {
        const err24 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err24];
        } else {
          vErrors.push(err24);
        }
        errors++;
      }
      validate12.errors = vErrors;
      return errors === 0;
    }
    function validate11(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      const _errs0 = errors;
      let valid0 = false;
      const _errs1 = errors;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.ok === void 0) {
          const err0 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "ok" }, message: "must have required property 'ok'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.goalId === void 0) {
          const err1 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.runId === void 0) {
          const err2 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.review === void 0) {
          const err3 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "review" }, message: "must have required property 'review'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "ok" || key0 === "goalId" || key0 === "runId" || key0 === "review")) {
            const err4 = { instancePath, schemaPath: "#/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.ok !== void 0) {
          let data0 = data.ok;
          if (typeof data0 !== "boolean") {
            const err5 = { instancePath: instancePath + "/ok", schemaPath: "#/anyOf/0/properties/ok/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
          if (true !== data0) {
            const err6 = { instancePath: instancePath + "/ok", schemaPath: "#/anyOf/0/properties/ok/const", keyword: "const", params: { allowedValue: true }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data.goalId !== void 0) {
          let data1 = data.goalId;
          if (typeof data1 === "string") {
            if (!pattern0.test(data1)) {
              const err7 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/0/properties/goalId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
          } else {
            const err8 = { instancePath: instancePath + "/goalId", schemaPath: "#/anyOf/0/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data.runId !== void 0) {
          let data2 = data.runId;
          if (typeof data2 === "string") {
            if (!pattern0.test(data2)) {
              const err9 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/0/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
          } else {
            const err10 = { instancePath: instancePath + "/runId", schemaPath: "#/anyOf/0/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data.review !== void 0) {
          if (!validate12(data.review, { instancePath: instancePath + "/review", parentData: data, parentDataProperty: "review", rootData })) {
            vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
            errors = vErrors.length;
          }
        }
      } else {
        const err11 = { instancePath, schemaPath: "#/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
      var _valid0 = _errs1 === errors;
      valid0 = valid0 || _valid0;
      if (!valid0) {
        const _errs11 = errors;
        if (data && typeof data == "object" && !Array.isArray(data)) {
          if (data.ok === void 0) {
            const err12 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "ok" }, message: "must have required property 'ok'" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
          if (data.error === void 0) {
            const err13 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "error" }, message: "must have required property 'error'" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
          for (const key1 in data) {
            if (!(key1 === "ok" || key1 === "error" || key1 === "issues")) {
              const err14 = { instancePath, schemaPath: "#/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
              if (vErrors === null) {
                vErrors = [err14];
              } else {
                vErrors.push(err14);
              }
              errors++;
            }
          }
          if (data.ok !== void 0) {
            let data4 = data.ok;
            if (typeof data4 !== "boolean") {
              const err15 = { instancePath: instancePath + "/ok", schemaPath: "#/anyOf/1/properties/ok/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            }
            if (false !== data4) {
              const err16 = { instancePath: instancePath + "/ok", schemaPath: "#/anyOf/1/properties/ok/const", keyword: "const", params: { allowedValue: false }, message: "must be equal to constant" };
              if (vErrors === null) {
                vErrors = [err16];
              } else {
                vErrors.push(err16);
              }
              errors++;
            }
          }
          if (data.error !== void 0) {
            let data5 = data.error;
            if (typeof data5 !== "string") {
              const err17 = { instancePath: instancePath + "/error", schemaPath: "#/anyOf/1/properties/error/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err17];
              } else {
                vErrors.push(err17);
              }
              errors++;
            }
            if (!(data5 === "goal_not_found" || data5 === "stale_run" || data5 === "action_not_waiting" || data5 === "action_id_mismatch" || data5 === "tool_not_found" || data5 === "invalid_tool_input" || data5 === "scope_unavailable" || data5 === "sandbox_scope_unavailable" || data5 === "review_unavailable")) {
              const err18 = { instancePath: instancePath + "/error", schemaPath: "#/anyOf/1/properties/error/enum", keyword: "enum", params: { allowedValues: schema12.anyOf[1].properties.error.enum }, message: "must be equal to one of the allowed values" };
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
          }
          if (data.issues !== void 0) {
            let data6 = data.issues;
            if (Array.isArray(data6)) {
              const len0 = data6.length;
              for (let i0 = 0; i0 < len0; i0++) {
                let data7 = data6[i0];
                if (data7 && typeof data7 == "object" && !Array.isArray(data7)) {
                  if (data7.path === void 0) {
                    const err19 = { instancePath: instancePath + "/issues/" + i0, schemaPath: "#/definitions/BrowserActionReviewIssue/required", keyword: "required", params: { missingProperty: "path" }, message: "must have required property 'path'" };
                    if (vErrors === null) {
                      vErrors = [err19];
                    } else {
                      vErrors.push(err19);
                    }
                    errors++;
                  }
                  if (data7.message === void 0) {
                    const err20 = { instancePath: instancePath + "/issues/" + i0, schemaPath: "#/definitions/BrowserActionReviewIssue/required", keyword: "required", params: { missingProperty: "message" }, message: "must have required property 'message'" };
                    if (vErrors === null) {
                      vErrors = [err20];
                    } else {
                      vErrors.push(err20);
                    }
                    errors++;
                  }
                  for (const key2 in data7) {
                    if (!(key2 === "path" || key2 === "message")) {
                      const err21 = { instancePath: instancePath + "/issues/" + i0, schemaPath: "#/definitions/BrowserActionReviewIssue/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                      if (vErrors === null) {
                        vErrors = [err21];
                      } else {
                        vErrors.push(err21);
                      }
                      errors++;
                    }
                  }
                  if (data7.path !== void 0) {
                    let data8 = data7.path;
                    if (Array.isArray(data8)) {
                      const len1 = data8.length;
                      for (let i1 = 0; i1 < len1; i1++) {
                        let data9 = data8[i1];
                        if (typeof data9 !== "string" && !(typeof data9 == "number" && isFinite(data9))) {
                          const err22 = { instancePath: instancePath + "/issues/" + i0 + "/path/" + i1, schemaPath: "#/definitions/BrowserActionReviewIssue/properties/path/items/type", keyword: "type", params: { type: schema18.properties.path.items.type }, message: "must be string,number" };
                          if (vErrors === null) {
                            vErrors = [err22];
                          } else {
                            vErrors.push(err22);
                          }
                          errors++;
                        }
                      }
                    } else {
                      const err23 = { instancePath: instancePath + "/issues/" + i0 + "/path", schemaPath: "#/definitions/BrowserActionReviewIssue/properties/path/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                      if (vErrors === null) {
                        vErrors = [err23];
                      } else {
                        vErrors.push(err23);
                      }
                      errors++;
                    }
                  }
                  if (data7.message !== void 0) {
                    if (typeof data7.message !== "string") {
                      const err24 = { instancePath: instancePath + "/issues/" + i0 + "/message", schemaPath: "#/definitions/BrowserActionReviewIssue/properties/message/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err24];
                      } else {
                        vErrors.push(err24);
                      }
                      errors++;
                    }
                  }
                } else {
                  const err25 = { instancePath: instancePath + "/issues/" + i0, schemaPath: "#/definitions/BrowserActionReviewIssue/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                  if (vErrors === null) {
                    vErrors = [err25];
                  } else {
                    vErrors.push(err25);
                  }
                  errors++;
                }
              }
            } else {
              const err26 = { instancePath: instancePath + "/issues", schemaPath: "#/anyOf/1/properties/issues/type", keyword: "type", params: { type: "array" }, message: "must be array" };
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
        var _valid0 = _errs11 === errors;
        valid0 = valid0 || _valid0;
      }
      if (!valid0) {
        const err28 = { instancePath, schemaPath: "#/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err28];
        } else {
          vErrors.push(err28);
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
export default require_BrowserActionReviewResult_validator();
