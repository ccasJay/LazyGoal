var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// GitCommitInput-validator.cjs
var require_GitCommitInput_validator = __commonJS({
  "GitCommitInput-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    function validate11(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.message === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "message" }, message: "must have required property 'message'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "message" || key0 === "repoPath" || key0 === "author")) {
            const err1 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
        }
        if (data.message !== void 0) {
          if (typeof data.message !== "string") {
            const err2 = { instancePath: instancePath + "/message", schemaPath: "#/properties/message/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.repoPath !== void 0) {
          if (typeof data.repoPath !== "string") {
            const err3 = { instancePath: instancePath + "/repoPath", schemaPath: "#/properties/repoPath/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.author !== void 0) {
          let data2 = data.author;
          if (data2 && typeof data2 == "object" && !Array.isArray(data2)) {
            if (data2.name === void 0) {
              const err4 = { instancePath: instancePath + "/author", schemaPath: "#/definitions/GitCommitAuthorInput/required", keyword: "required", params: { missingProperty: "name" }, message: "must have required property 'name'" };
              if (vErrors === null) {
                vErrors = [err4];
              } else {
                vErrors.push(err4);
              }
              errors++;
            }
            if (data2.email === void 0) {
              const err5 = { instancePath: instancePath + "/author", schemaPath: "#/definitions/GitCommitAuthorInput/required", keyword: "required", params: { missingProperty: "email" }, message: "must have required property 'email'" };
              if (vErrors === null) {
                vErrors = [err5];
              } else {
                vErrors.push(err5);
              }
              errors++;
            }
            for (const key1 in data2) {
              if (!(key1 === "name" || key1 === "email")) {
                const err6 = { instancePath: instancePath + "/author", schemaPath: "#/definitions/GitCommitAuthorInput/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err6];
                } else {
                  vErrors.push(err6);
                }
                errors++;
              }
            }
            if (data2.name !== void 0) {
              if (typeof data2.name !== "string") {
                const err7 = { instancePath: instancePath + "/author/name", schemaPath: "#/definitions/GitCommitAuthorInput/properties/name/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err7];
                } else {
                  vErrors.push(err7);
                }
                errors++;
              }
            }
            if (data2.email !== void 0) {
              if (typeof data2.email !== "string") {
                const err8 = { instancePath: instancePath + "/author/email", schemaPath: "#/definitions/GitCommitAuthorInput/properties/email/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err8];
                } else {
                  vErrors.push(err8);
                }
                errors++;
              }
            }
          } else {
            const err9 = { instancePath: instancePath + "/author", schemaPath: "#/definitions/GitCommitAuthorInput/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
        }
      } else {
        const err10 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err10];
        } else {
          vErrors.push(err10);
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
export default require_GitCommitInput_validator();
