var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// SandboxGrantLedgerFile-validator.cjs
var require_SandboxGrantLedgerFile_validator = __commonJS({
  "SandboxGrantLedgerFile-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema13 = { "type": "object", "properties": { "id": { "type": "string" }, "scope": { "type": "string", "enum": ["goal", "workspace"] }, "workspaceId": { "type": "string" }, "goalId": { "type": "string" }, "source": { "$ref": "#/definitions/GrantFileSource" }, "matcher": { "$ref": "#/definitions/SandboxGrantFileMatcher" }, "status": { "type": "string", "enum": ["pending", "active", "revoked"] } }, "required": ["id", "scope", "workspaceId", "source", "matcher", "status"], "additionalProperties": false, "description": "Sandbox Grant \u8D26\u672C\u4E2D\u7684\u5355\u6761\u6388\u6743\u6587\u4EF6\u8868\u793A\u3002" };
    var schema16 = { "type": "object", "properties": { "extraFiles": { "type": "array", "items": { "$ref": "#/definitions/SandboxGrantFileExtraFile" } }, "network": { "type": "string", "enum": ["none", "all_outbound"] } }, "required": ["extraFiles", "network"], "additionalProperties": false, "description": "Sandbox Grant \u8D26\u672C\u4E2D\u7684\u53D7\u9650\u8303\u56F4\u3002" };
    var schema17 = { "type": "object", "properties": { "canonicalPath": { "type": "string" }, "access": { "type": "string", "enum": ["read", "write"] }, "kind": { "type": "string", "enum": ["file", "directory_tree"] } }, "required": ["canonicalPath", "access", "kind"], "additionalProperties": false, "description": "Sandbox Grant \u8D26\u672C\u4E2D\u7684\u989D\u5916\u6587\u4EF6\u8303\u56F4\u3002" };
    function validate14(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.extraFiles === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "extraFiles" }, message: "must have required property 'extraFiles'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.network === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "network" }, message: "must have required property 'network'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "extraFiles" || key0 === "network")) {
            const err2 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.extraFiles !== void 0) {
          let data0 = data.extraFiles;
          if (Array.isArray(data0)) {
            const len0 = data0.length;
            for (let i0 = 0; i0 < len0; i0++) {
              let data1 = data0[i0];
              if (data1 && typeof data1 == "object" && !Array.isArray(data1)) {
                if (data1.canonicalPath === void 0) {
                  const err3 = { instancePath: instancePath + "/extraFiles/" + i0, schemaPath: "#/definitions/SandboxGrantFileExtraFile/required", keyword: "required", params: { missingProperty: "canonicalPath" }, message: "must have required property 'canonicalPath'" };
                  if (vErrors === null) {
                    vErrors = [err3];
                  } else {
                    vErrors.push(err3);
                  }
                  errors++;
                }
                if (data1.access === void 0) {
                  const err4 = { instancePath: instancePath + "/extraFiles/" + i0, schemaPath: "#/definitions/SandboxGrantFileExtraFile/required", keyword: "required", params: { missingProperty: "access" }, message: "must have required property 'access'" };
                  if (vErrors === null) {
                    vErrors = [err4];
                  } else {
                    vErrors.push(err4);
                  }
                  errors++;
                }
                if (data1.kind === void 0) {
                  const err5 = { instancePath: instancePath + "/extraFiles/" + i0, schemaPath: "#/definitions/SandboxGrantFileExtraFile/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                  if (vErrors === null) {
                    vErrors = [err5];
                  } else {
                    vErrors.push(err5);
                  }
                  errors++;
                }
                for (const key1 in data1) {
                  if (!(key1 === "canonicalPath" || key1 === "access" || key1 === "kind")) {
                    const err6 = { instancePath: instancePath + "/extraFiles/" + i0, schemaPath: "#/definitions/SandboxGrantFileExtraFile/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err6];
                    } else {
                      vErrors.push(err6);
                    }
                    errors++;
                  }
                }
                if (data1.canonicalPath !== void 0) {
                  if (typeof data1.canonicalPath !== "string") {
                    const err7 = { instancePath: instancePath + "/extraFiles/" + i0 + "/canonicalPath", schemaPath: "#/definitions/SandboxGrantFileExtraFile/properties/canonicalPath/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err7];
                    } else {
                      vErrors.push(err7);
                    }
                    errors++;
                  }
                }
                if (data1.access !== void 0) {
                  let data3 = data1.access;
                  if (typeof data3 !== "string") {
                    const err8 = { instancePath: instancePath + "/extraFiles/" + i0 + "/access", schemaPath: "#/definitions/SandboxGrantFileExtraFile/properties/access/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err8];
                    } else {
                      vErrors.push(err8);
                    }
                    errors++;
                  }
                  if (!(data3 === "read" || data3 === "write")) {
                    const err9 = { instancePath: instancePath + "/extraFiles/" + i0 + "/access", schemaPath: "#/definitions/SandboxGrantFileExtraFile/properties/access/enum", keyword: "enum", params: { allowedValues: schema17.properties.access.enum }, message: "must be equal to one of the allowed values" };
                    if (vErrors === null) {
                      vErrors = [err9];
                    } else {
                      vErrors.push(err9);
                    }
                    errors++;
                  }
                }
                if (data1.kind !== void 0) {
                  let data4 = data1.kind;
                  if (typeof data4 !== "string") {
                    const err10 = { instancePath: instancePath + "/extraFiles/" + i0 + "/kind", schemaPath: "#/definitions/SandboxGrantFileExtraFile/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err10];
                    } else {
                      vErrors.push(err10);
                    }
                    errors++;
                  }
                  if (!(data4 === "file" || data4 === "directory_tree")) {
                    const err11 = { instancePath: instancePath + "/extraFiles/" + i0 + "/kind", schemaPath: "#/definitions/SandboxGrantFileExtraFile/properties/kind/enum", keyword: "enum", params: { allowedValues: schema17.properties.kind.enum }, message: "must be equal to one of the allowed values" };
                    if (vErrors === null) {
                      vErrors = [err11];
                    } else {
                      vErrors.push(err11);
                    }
                    errors++;
                  }
                }
              } else {
                const err12 = { instancePath: instancePath + "/extraFiles/" + i0, schemaPath: "#/definitions/SandboxGrantFileExtraFile/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err12];
                } else {
                  vErrors.push(err12);
                }
                errors++;
              }
            }
          } else {
            const err13 = { instancePath: instancePath + "/extraFiles", schemaPath: "#/properties/extraFiles/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
        }
        if (data.network !== void 0) {
          let data5 = data.network;
          if (typeof data5 !== "string") {
            const err14 = { instancePath: instancePath + "/network", schemaPath: "#/properties/network/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
          if (!(data5 === "none" || data5 === "all_outbound")) {
            const err15 = { instancePath: instancePath + "/network", schemaPath: "#/properties/network/enum", keyword: "enum", params: { allowedValues: schema16.properties.network.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
        }
      } else {
        const err16 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      }
      validate14.errors = vErrors;
      return errors === 0;
    }
    function validate13(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
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
        if (data.inputDigest === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "inputDigest" }, message: "must have required property 'inputDigest'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.scope === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "scope" }, message: "must have required property 'scope'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.version === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "version" }, message: "must have required property 'version'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "toolId" || key0 === "inputDigest" || key0 === "scope" || key0 === "version")) {
            const err4 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.toolId !== void 0) {
          if (typeof data.toolId !== "string") {
            const err5 = { instancePath: instancePath + "/toolId", schemaPath: "#/properties/toolId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.inputDigest !== void 0) {
          if (typeof data.inputDigest !== "string") {
            const err6 = { instancePath: instancePath + "/inputDigest", schemaPath: "#/properties/inputDigest/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data.scope !== void 0) {
          if (!validate14(data.scope, { instancePath: instancePath + "/scope", parentData: data, parentDataProperty: "scope", rootData })) {
            vErrors = vErrors === null ? validate14.errors : vErrors.concat(validate14.errors);
            errors = vErrors.length;
          }
        }
        if (data.version !== void 0) {
          let data3 = data.version;
          if (!(typeof data3 == "number" && isFinite(data3))) {
            const err7 = { instancePath: instancePath + "/version", schemaPath: "#/properties/version/type", keyword: "type", params: { type: "number" }, message: "must be number" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
          if (1 !== data3) {
            const err8 = { instancePath: instancePath + "/version", schemaPath: "#/properties/version/const", keyword: "const", params: { allowedValue: 1 }, message: "must be equal to constant" };
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
      validate13.errors = vErrors;
      return errors === 0;
    }
    function validate12(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.id === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "id" }, message: "must have required property 'id'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.scope === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "scope" }, message: "must have required property 'scope'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.workspaceId === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "workspaceId" }, message: "must have required property 'workspaceId'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.source === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "source" }, message: "must have required property 'source'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.matcher === void 0) {
          const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "matcher" }, message: "must have required property 'matcher'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        if (data.status === void 0) {
          const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "id" || key0 === "scope" || key0 === "workspaceId" || key0 === "goalId" || key0 === "source" || key0 === "matcher" || key0 === "status")) {
            const err6 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data.id !== void 0) {
          if (typeof data.id !== "string") {
            const err7 = { instancePath: instancePath + "/id", schemaPath: "#/properties/id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
        if (data.scope !== void 0) {
          let data1 = data.scope;
          if (typeof data1 !== "string") {
            const err8 = { instancePath: instancePath + "/scope", schemaPath: "#/properties/scope/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
          if (!(data1 === "goal" || data1 === "workspace")) {
            const err9 = { instancePath: instancePath + "/scope", schemaPath: "#/properties/scope/enum", keyword: "enum", params: { allowedValues: schema13.properties.scope.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
        }
        if (data.workspaceId !== void 0) {
          if (typeof data.workspaceId !== "string") {
            const err10 = { instancePath: instancePath + "/workspaceId", schemaPath: "#/properties/workspaceId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
        }
        if (data.goalId !== void 0) {
          if (typeof data.goalId !== "string") {
            const err11 = { instancePath: instancePath + "/goalId", schemaPath: "#/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
        }
        if (data.source !== void 0) {
          let data4 = data.source;
          if (data4 && typeof data4 == "object" && !Array.isArray(data4)) {
            if (data4.goalId === void 0) {
              const err12 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GrantFileSource/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
            if (data4.runId === void 0) {
              const err13 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GrantFileSource/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
            if (data4.actionId === void 0) {
              const err14 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GrantFileSource/required", keyword: "required", params: { missingProperty: "actionId" }, message: "must have required property 'actionId'" };
              if (vErrors === null) {
                vErrors = [err14];
              } else {
                vErrors.push(err14);
              }
              errors++;
            }
            if (data4.approvalInputId === void 0) {
              const err15 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GrantFileSource/required", keyword: "required", params: { missingProperty: "approvalInputId" }, message: "must have required property 'approvalInputId'" };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            }
            for (const key1 in data4) {
              if (!(key1 === "goalId" || key1 === "runId" || key1 === "actionId" || key1 === "approvalInputId")) {
                const err16 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GrantFileSource/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err16];
                } else {
                  vErrors.push(err16);
                }
                errors++;
              }
            }
            if (data4.goalId !== void 0) {
              if (typeof data4.goalId !== "string") {
                const err17 = { instancePath: instancePath + "/source/goalId", schemaPath: "#/definitions/GrantFileSource/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err17];
                } else {
                  vErrors.push(err17);
                }
                errors++;
              }
            }
            if (data4.runId !== void 0) {
              if (typeof data4.runId !== "string") {
                const err18 = { instancePath: instancePath + "/source/runId", schemaPath: "#/definitions/GrantFileSource/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err18];
                } else {
                  vErrors.push(err18);
                }
                errors++;
              }
            }
            if (data4.actionId !== void 0) {
              if (typeof data4.actionId !== "string") {
                const err19 = { instancePath: instancePath + "/source/actionId", schemaPath: "#/definitions/GrantFileSource/properties/actionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err19];
                } else {
                  vErrors.push(err19);
                }
                errors++;
              }
            }
            if (data4.approvalInputId !== void 0) {
              if (typeof data4.approvalInputId !== "string") {
                const err20 = { instancePath: instancePath + "/source/approvalInputId", schemaPath: "#/definitions/GrantFileSource/properties/approvalInputId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err20];
                } else {
                  vErrors.push(err20);
                }
                errors++;
              }
            }
          } else {
            const err21 = { instancePath: instancePath + "/source", schemaPath: "#/definitions/GrantFileSource/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err21];
            } else {
              vErrors.push(err21);
            }
            errors++;
          }
        }
        if (data.matcher !== void 0) {
          if (!validate13(data.matcher, { instancePath: instancePath + "/matcher", parentData: data, parentDataProperty: "matcher", rootData })) {
            vErrors = vErrors === null ? validate13.errors : vErrors.concat(validate13.errors);
            errors = vErrors.length;
          }
        }
        if (data.status !== void 0) {
          let data10 = data.status;
          if (typeof data10 !== "string") {
            const err22 = { instancePath: instancePath + "/status", schemaPath: "#/properties/status/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err22];
            } else {
              vErrors.push(err22);
            }
            errors++;
          }
          if (!(data10 === "pending" || data10 === "active" || data10 === "revoked")) {
            const err23 = { instancePath: instancePath + "/status", schemaPath: "#/properties/status/enum", keyword: "enum", params: { allowedValues: schema13.properties.status.enum }, message: "must be equal to one of the allowed values" };
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
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.version === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "version" }, message: "must have required property 'version'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.grants === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "grants" }, message: "must have required property 'grants'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "version" || key0 === "grants")) {
            const err2 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.version !== void 0) {
          let data0 = data.version;
          if (!(typeof data0 == "number" && isFinite(data0))) {
            const err3 = { instancePath: instancePath + "/version", schemaPath: "#/properties/version/type", keyword: "type", params: { type: "number" }, message: "must be number" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
          if (1 !== data0) {
            const err4 = { instancePath: instancePath + "/version", schemaPath: "#/properties/version/const", keyword: "const", params: { allowedValue: 1 }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.grants !== void 0) {
          let data1 = data.grants;
          if (Array.isArray(data1)) {
            const len0 = data1.length;
            for (let i0 = 0; i0 < len0; i0++) {
              if (!validate12(data1[i0], { instancePath: instancePath + "/grants/" + i0, parentData: data1, parentDataProperty: i0, rootData })) {
                vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
                errors = vErrors.length;
              }
            }
          } else {
            const err5 = { instancePath: instancePath + "/grants", schemaPath: "#/properties/grants/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
      } else {
        const err6 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err6];
        } else {
          vErrors.push(err6);
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
export default require_SandboxGrantLedgerFile_validator();
