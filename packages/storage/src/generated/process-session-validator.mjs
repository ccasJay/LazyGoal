var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// ProcessSessionFileRecord-validator.cjs
var require_ProcessSessionFileRecord_validator = __commonJS({
  "ProcessSessionFileRecord-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema12 = { "type": "object", "properties": { "goalId": { "type": "string" }, "processId": { "type": "string" }, "command": { "type": "string" }, "status": { "type": "string", "enum": ["starting", "running", "exited", "stopped", "failed", "interrupted"] }, "hostInstanceId": { "type": "string" }, "startedAt": { "type": "string" }, "exitedAt": { "type": "string" }, "exitCode": { "type": ["number", "null"] }, "signal": { "type": ["string", "null"] }, "error": { "type": "string" }, "actionId": { "type": "string" } }, "required": ["goalId", "processId", "command", "status", "hostInstanceId", "startedAt"], "additionalProperties": false, "description": "\u8FDB\u7A0B\u4F1A\u8BDD\u5143\u6570\u636E\u6587\u4EF6\u7684\u6301\u4E45\u5316 DTO\u3002" };
    var func2 = Object.prototype.hasOwnProperty;
    function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      ;
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.goalId === void 0) {
          const err0 = { instancePath, schemaPath: "#/definitions/ProcessSessionFileRecord/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.processId === void 0) {
          const err1 = { instancePath, schemaPath: "#/definitions/ProcessSessionFileRecord/required", keyword: "required", params: { missingProperty: "processId" }, message: "must have required property 'processId'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.command === void 0) {
          const err2 = { instancePath, schemaPath: "#/definitions/ProcessSessionFileRecord/required", keyword: "required", params: { missingProperty: "command" }, message: "must have required property 'command'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.status === void 0) {
          const err3 = { instancePath, schemaPath: "#/definitions/ProcessSessionFileRecord/required", keyword: "required", params: { missingProperty: "status" }, message: "must have required property 'status'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.hostInstanceId === void 0) {
          const err4 = { instancePath, schemaPath: "#/definitions/ProcessSessionFileRecord/required", keyword: "required", params: { missingProperty: "hostInstanceId" }, message: "must have required property 'hostInstanceId'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        if (data.startedAt === void 0) {
          const err5 = { instancePath, schemaPath: "#/definitions/ProcessSessionFileRecord/required", keyword: "required", params: { missingProperty: "startedAt" }, message: "must have required property 'startedAt'" };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!func2.call(schema12.properties, key0)) {
            const err6 = { instancePath, schemaPath: "#/definitions/ProcessSessionFileRecord/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err6];
            } else {
              vErrors.push(err6);
            }
            errors++;
          }
        }
        if (data.goalId !== void 0) {
          if (typeof data.goalId !== "string") {
            const err7 = { instancePath: instancePath + "/goalId", schemaPath: "#/definitions/ProcessSessionFileRecord/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err7];
            } else {
              vErrors.push(err7);
            }
            errors++;
          }
        }
        if (data.processId !== void 0) {
          if (typeof data.processId !== "string") {
            const err8 = { instancePath: instancePath + "/processId", schemaPath: "#/definitions/ProcessSessionFileRecord/properties/processId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err8];
            } else {
              vErrors.push(err8);
            }
            errors++;
          }
        }
        if (data.command !== void 0) {
          if (typeof data.command !== "string") {
            const err9 = { instancePath: instancePath + "/command", schemaPath: "#/definitions/ProcessSessionFileRecord/properties/command/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
        }
        if (data.status !== void 0) {
          let data3 = data.status;
          if (typeof data3 !== "string") {
            const err10 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/ProcessSessionFileRecord/properties/status/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
          if (!(data3 === "starting" || data3 === "running" || data3 === "exited" || data3 === "stopped" || data3 === "failed" || data3 === "interrupted")) {
            const err11 = { instancePath: instancePath + "/status", schemaPath: "#/definitions/ProcessSessionFileRecord/properties/status/enum", keyword: "enum", params: { allowedValues: schema12.properties.status.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
        }
        if (data.hostInstanceId !== void 0) {
          if (typeof data.hostInstanceId !== "string") {
            const err12 = { instancePath: instancePath + "/hostInstanceId", schemaPath: "#/definitions/ProcessSessionFileRecord/properties/hostInstanceId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
        }
        if (data.startedAt !== void 0) {
          if (typeof data.startedAt !== "string") {
            const err13 = { instancePath: instancePath + "/startedAt", schemaPath: "#/definitions/ProcessSessionFileRecord/properties/startedAt/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
        }
        if (data.exitedAt !== void 0) {
          if (typeof data.exitedAt !== "string") {
            const err14 = { instancePath: instancePath + "/exitedAt", schemaPath: "#/definitions/ProcessSessionFileRecord/properties/exitedAt/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
        }
        if (data.exitCode !== void 0) {
          let data7 = data.exitCode;
          if (!(typeof data7 == "number" && isFinite(data7)) && data7 !== null) {
            const err15 = { instancePath: instancePath + "/exitCode", schemaPath: "#/definitions/ProcessSessionFileRecord/properties/exitCode/type", keyword: "type", params: { type: schema12.properties.exitCode.type }, message: "must be number,null" };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
        }
        if (data.signal !== void 0) {
          let data8 = data.signal;
          if (typeof data8 !== "string" && data8 !== null) {
            const err16 = { instancePath: instancePath + "/signal", schemaPath: "#/definitions/ProcessSessionFileRecord/properties/signal/type", keyword: "type", params: { type: schema12.properties.signal.type }, message: "must be string,null" };
            if (vErrors === null) {
              vErrors = [err16];
            } else {
              vErrors.push(err16);
            }
            errors++;
          }
        }
        if (data.error !== void 0) {
          if (typeof data.error !== "string") {
            const err17 = { instancePath: instancePath + "/error", schemaPath: "#/definitions/ProcessSessionFileRecord/properties/error/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err17];
            } else {
              vErrors.push(err17);
            }
            errors++;
          }
        }
        if (data.actionId !== void 0) {
          if (typeof data.actionId !== "string") {
            const err18 = { instancePath: instancePath + "/actionId", schemaPath: "#/definitions/ProcessSessionFileRecord/properties/actionId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err18];
            } else {
              vErrors.push(err18);
            }
            errors++;
          }
        }
      } else {
        const err19 = { instancePath, schemaPath: "#/definitions/ProcessSessionFileRecord/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err19];
        } else {
          vErrors.push(err19);
        }
        errors++;
      }
      validate10.errors = vErrors;
      return errors === 0;
    }
  }
});
export default require_ProcessSessionFileRecord_validator();
