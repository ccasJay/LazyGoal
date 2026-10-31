var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// BashInput-validator.cjs
var require_BashInput_validator = __commonJS({
  "BashInput-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema14 = { "type": "object", "properties": { "path": { "type": "string", "description": "\u7533\u8BF7\u8DEF\u5F84\u3002" }, "access": { "type": "string", "enum": ["read", "write"], "description": "\u8BBF\u95EE\u7C7B\u578B\u3002" }, "kind": { "type": "string", "enum": ["file", "directory_tree"], "description": "\u7533\u8BF7\u8303\u56F4\u3002" }, "purpose": { "type": "string", "description": "\u7533\u8BF7\u7528\u9014\u8BF4\u660E\u3002" } }, "required": ["path", "access", "kind", "purpose"], "additionalProperties": false, "description": "Bash \u5DE5\u5177\u7533\u8BF7\u7684\u5355\u6587\u4EF6\u6216\u76EE\u5F55\u6811\u8BBF\u95EE\u3002" };
    function validate12(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        for (const key0 in data) {
          if (!(key0 === "files" || key0 === "network")) {
            const err0 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err0];
            } else {
              vErrors.push(err0);
            }
            errors++;
          }
        }
        if (data.files !== void 0) {
          let data0 = data.files;
          if (Array.isArray(data0)) {
            const len0 = data0.length;
            for (let i0 = 0; i0 < len0; i0++) {
              let data1 = data0[i0];
              if (data1 && typeof data1 == "object" && !Array.isArray(data1)) {
                if (data1.path === void 0) {
                  const err1 = { instancePath: instancePath + "/files/" + i0, schemaPath: "#/definitions/BashSandboxFileAccessInput/required", keyword: "required", params: { missingProperty: "path" }, message: "must have required property 'path'" };
                  if (vErrors === null) {
                    vErrors = [err1];
                  } else {
                    vErrors.push(err1);
                  }
                  errors++;
                }
                if (data1.access === void 0) {
                  const err2 = { instancePath: instancePath + "/files/" + i0, schemaPath: "#/definitions/BashSandboxFileAccessInput/required", keyword: "required", params: { missingProperty: "access" }, message: "must have required property 'access'" };
                  if (vErrors === null) {
                    vErrors = [err2];
                  } else {
                    vErrors.push(err2);
                  }
                  errors++;
                }
                if (data1.kind === void 0) {
                  const err3 = { instancePath: instancePath + "/files/" + i0, schemaPath: "#/definitions/BashSandboxFileAccessInput/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                  if (vErrors === null) {
                    vErrors = [err3];
                  } else {
                    vErrors.push(err3);
                  }
                  errors++;
                }
                if (data1.purpose === void 0) {
                  const err4 = { instancePath: instancePath + "/files/" + i0, schemaPath: "#/definitions/BashSandboxFileAccessInput/required", keyword: "required", params: { missingProperty: "purpose" }, message: "must have required property 'purpose'" };
                  if (vErrors === null) {
                    vErrors = [err4];
                  } else {
                    vErrors.push(err4);
                  }
                  errors++;
                }
                for (const key1 in data1) {
                  if (!(key1 === "path" || key1 === "access" || key1 === "kind" || key1 === "purpose")) {
                    const err5 = { instancePath: instancePath + "/files/" + i0, schemaPath: "#/definitions/BashSandboxFileAccessInput/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err5];
                    } else {
                      vErrors.push(err5);
                    }
                    errors++;
                  }
                }
                if (data1.path !== void 0) {
                  if (typeof data1.path !== "string") {
                    const err6 = { instancePath: instancePath + "/files/" + i0 + "/path", schemaPath: "#/definitions/BashSandboxFileAccessInput/properties/path/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err6];
                    } else {
                      vErrors.push(err6);
                    }
                    errors++;
                  }
                }
                if (data1.access !== void 0) {
                  let data3 = data1.access;
                  if (typeof data3 !== "string") {
                    const err7 = { instancePath: instancePath + "/files/" + i0 + "/access", schemaPath: "#/definitions/BashSandboxFileAccessInput/properties/access/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err7];
                    } else {
                      vErrors.push(err7);
                    }
                    errors++;
                  }
                  if (!(data3 === "read" || data3 === "write")) {
                    const err8 = { instancePath: instancePath + "/files/" + i0 + "/access", schemaPath: "#/definitions/BashSandboxFileAccessInput/properties/access/enum", keyword: "enum", params: { allowedValues: schema14.properties.access.enum }, message: "must be equal to one of the allowed values" };
                    if (vErrors === null) {
                      vErrors = [err8];
                    } else {
                      vErrors.push(err8);
                    }
                    errors++;
                  }
                }
                if (data1.kind !== void 0) {
                  let data4 = data1.kind;
                  if (typeof data4 !== "string") {
                    const err9 = { instancePath: instancePath + "/files/" + i0 + "/kind", schemaPath: "#/definitions/BashSandboxFileAccessInput/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err9];
                    } else {
                      vErrors.push(err9);
                    }
                    errors++;
                  }
                  if (!(data4 === "file" || data4 === "directory_tree")) {
                    const err10 = { instancePath: instancePath + "/files/" + i0 + "/kind", schemaPath: "#/definitions/BashSandboxFileAccessInput/properties/kind/enum", keyword: "enum", params: { allowedValues: schema14.properties.kind.enum }, message: "must be equal to one of the allowed values" };
                    if (vErrors === null) {
                      vErrors = [err10];
                    } else {
                      vErrors.push(err10);
                    }
                    errors++;
                  }
                }
                if (data1.purpose !== void 0) {
                  if (typeof data1.purpose !== "string") {
                    const err11 = { instancePath: instancePath + "/files/" + i0 + "/purpose", schemaPath: "#/definitions/BashSandboxFileAccessInput/properties/purpose/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err11];
                    } else {
                      vErrors.push(err11);
                    }
                    errors++;
                  }
                }
              } else {
                const err12 = { instancePath: instancePath + "/files/" + i0, schemaPath: "#/definitions/BashSandboxFileAccessInput/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err12];
                } else {
                  vErrors.push(err12);
                }
                errors++;
              }
            }
          } else {
            const err13 = { instancePath: instancePath + "/files", schemaPath: "#/properties/files/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
        }
        if (data.network !== void 0) {
          let data6 = data.network;
          if (data6 && typeof data6 == "object" && !Array.isArray(data6)) {
            if (data6.targets === void 0) {
              const err14 = { instancePath: instancePath + "/network", schemaPath: "#/definitions/BashSandboxNetworkAccessInput/required", keyword: "required", params: { missingProperty: "targets" }, message: "must have required property 'targets'" };
              if (vErrors === null) {
                vErrors = [err14];
              } else {
                vErrors.push(err14);
              }
              errors++;
            }
            if (data6.purpose === void 0) {
              const err15 = { instancePath: instancePath + "/network", schemaPath: "#/definitions/BashSandboxNetworkAccessInput/required", keyword: "required", params: { missingProperty: "purpose" }, message: "must have required property 'purpose'" };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            }
            for (const key2 in data6) {
              if (!(key2 === "targets" || key2 === "purpose")) {
                const err16 = { instancePath: instancePath + "/network", schemaPath: "#/definitions/BashSandboxNetworkAccessInput/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err16];
                } else {
                  vErrors.push(err16);
                }
                errors++;
              }
            }
            if (data6.targets !== void 0) {
              let data7 = data6.targets;
              if (Array.isArray(data7)) {
                const len1 = data7.length;
                for (let i1 = 0; i1 < len1; i1++) {
                  if (typeof data7[i1] !== "string") {
                    const err17 = { instancePath: instancePath + "/network/targets/" + i1, schemaPath: "#/definitions/BashSandboxNetworkAccessInput/properties/targets/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err17];
                    } else {
                      vErrors.push(err17);
                    }
                    errors++;
                  }
                }
              } else {
                const err18 = { instancePath: instancePath + "/network/targets", schemaPath: "#/definitions/BashSandboxNetworkAccessInput/properties/targets/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                if (vErrors === null) {
                  vErrors = [err18];
                } else {
                  vErrors.push(err18);
                }
                errors++;
              }
            }
            if (data6.purpose !== void 0) {
              if (typeof data6.purpose !== "string") {
                const err19 = { instancePath: instancePath + "/network/purpose", schemaPath: "#/definitions/BashSandboxNetworkAccessInput/properties/purpose/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err19];
                } else {
                  vErrors.push(err19);
                }
                errors++;
              }
            }
          } else {
            const err20 = { instancePath: instancePath + "/network", schemaPath: "#/definitions/BashSandboxNetworkAccessInput/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err20];
            } else {
              vErrors.push(err20);
            }
            errors++;
          }
        }
      } else {
        const err21 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err21];
        } else {
          vErrors.push(err21);
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
        if (data.command === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "command" }, message: "must have required property 'command'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "command" || key0 === "timeoutMs" || key0 === "sandboxAccess")) {
            const err1 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
        }
        if (data.command !== void 0) {
          if (typeof data.command !== "string") {
            const err2 = { instancePath: instancePath + "/command", schemaPath: "#/properties/command/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.timeoutMs !== void 0) {
          let data1 = data.timeoutMs;
          if (!(typeof data1 == "number" && (!(data1 % 1) && !isNaN(data1)) && isFinite(data1))) {
            const err3 = { instancePath: instancePath + "/timeoutMs", schemaPath: "#/properties/timeoutMs/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
          if (typeof data1 == "number" && isFinite(data1)) {
            if (data1 > 12e4 || isNaN(data1)) {
              const err4 = { instancePath: instancePath + "/timeoutMs", schemaPath: "#/properties/timeoutMs/maximum", keyword: "maximum", params: { comparison: "<=", limit: 12e4 }, message: "must be <= 120000" };
              if (vErrors === null) {
                vErrors = [err4];
              } else {
                vErrors.push(err4);
              }
              errors++;
            }
            if (data1 < 1 || isNaN(data1)) {
              const err5 = { instancePath: instancePath + "/timeoutMs", schemaPath: "#/properties/timeoutMs/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
              if (vErrors === null) {
                vErrors = [err5];
              } else {
                vErrors.push(err5);
              }
              errors++;
            }
          }
        }
        if (data.sandboxAccess !== void 0) {
          if (!validate12(data.sandboxAccess, { instancePath: instancePath + "/sandboxAccess", parentData: data, parentDataProperty: "sandboxAccess", rootData })) {
            vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
            errors = vErrors.length;
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
export default require_BashInput_validator();
