'use strict';

// Declare library dependencies
const express = require('express');
const sls = require('serverless-http');
const bodyParser = require('body-parser');
const uuidV4 = require('uuid/v4');
const request = require('request');

//Configure Environment
const configModule = require('../helpers/config.js');
var configuration = configModule.configure(process.env.NODE_ENV);

//Configure Logging
const winston = require('winston');
winston.level = configuration.loglevel;

var tenantURL   = configuration.url.tenant;
var userURL   = configuration.url.user;

// Instantiate application
var app = express();

// Configure middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: false
}));
app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, PATCH, DELETE");
    res.header("Access-Control-Allow-Headers", "Content-Type, Origin, X-Amz-Date, Authorization, X-Api-Key, X-Amz-Security-Token, Access-Control-Allow-Headers, X-Requested-With, Access-Control-Allow-Origin");
    // intercept OPTIONS method
    if ('OPTIONS' == req.method) {
        res.send(200);
    }
    else {
        next();
    }
});

/**
 * Register a new tenant
 */
app.post('/reg', function (req, res) {
    var tenant = req.body;

    // Generate the tenant id
    tenant.id = 'TENANT' + uuidV4();
    winston.debug('Creating Tenant ID: ' + tenant.id);
    tenant.id = tenant.id.split('-').join('');

    // if the tenant doesn't exist, create one
    tenantExists(tenant, function(tenantExists) {
        if (tenantExists) {
            winston.error("Error registering new tenant");
            res.status(400).send("Error registering new tenant");
        }
        else {
            registerTenantAdmin(tenant)
                .then(function (tenData) {
                    //Adding Data to the Tenant Object that will be required to cleaning up all created resources for all tenants.
                    tenant.UserPoolId = tenData.pool.UserPool.Id;
                    tenant.IdentityPoolId = tenData.identityPool.IdentityPoolId;

                    tenant.systemAdminRole = tenData.role.systemAdminRole;
                    tenant.systemSupportRole = tenData.role.systemSupportRole;
                    tenant.trustRole = tenData.role.trustRole;

                    tenant.systemAdminPolicy = tenData.policy.systemAdminPolicy;
                    tenant.systemSupportPolicy = tenData.policy.systemSupportPolicy;

                    saveTenantData(tenant)
                })
                .then(function () {
                    winston.debug("Tenant registered: " + tenant.id);
                    res.status(200).send("Tenant " + tenant.id + " registered");
                })
                .catch(function (error) {
                    winston.error("Error registering new tenant: " + error.message);
                    res.status(400).send("Error registering tenant: " + error.message);
                });
        }
    });
});

/**
 * Determine if a tenant can be created (they may already exist)
 * @param tenant The tenant data
 * @returns True if the tenant exists
 */
function tenantExists(tenant, callback) {
    // Create URL for user-manager request
    var userExistsUrl = userURL + '/pool/' + tenant.userName;

    // see if the user already exists
    request({
        url: userExistsUrl,
        method: "GET",
        json: true,
        headers: {"content-type": "application/json"}
    }, function (error, response, body) {
        console.log('kkkkkkkkkkkkkk');
        console.log(error);
        console.log(response);
        console.log(body);
        if (error)
            callback(false);
        else if ((response != null) && (response.statusCode == 400))
            callback(false);
        else {
            if (body.userName === tenant.userName)
                callback(true);
            else
                callback(false);
        }
    });
};

/**
 * Register a new tenant user and provision policies for that user
 * @param tenant The new tenant data
 * @returns {Promise} Results of tenant provisioning
 */
function registerTenantAdmin(tenant) {
    var promise = new Promise(function(resolve, reject) {

        // init the request with tenant data
        var tenantAdminData = {
            "tenant_id": tenant.id,
            "companyName": tenant.companyName,
            "accountName": tenant.accountName,
            "ownerName": tenant.ownerName,
            "tier": tenant.tier,
            "email": tenant.email,
            "userName": tenant.userName,
            "role": tenant.role,
            "firstName": tenant.firstName,
            "lastName": tenant.lastName
        };

        // REST API URL
        var registerTenantUserURL = configuration.url.user + '/reg';

        // fire request
        request({
            url: registerTenantUserURL,
            method: "POST",
            json: true,
            headers: {"content-type": "application/json"},
            body: tenantAdminData
        }, function (error, response, body) {
            if (error || (response.statusCode != 200))
                reject(error)
            else {
                resolve(body);
            }
        });
    });

    return promise;
}

/**
 * Save the configration and status of the new tenant
 * @param tenant Data for the tenant to be created
 * @returns {Promise} The created tenant
 */
function saveTenantData(tenant) {
    var promise = new Promise(function(resolve, reject) {
        // init the tenant sace request
        var tenantRequestData = {
            "id": tenant.id,
            "companyName": tenant.companyName,
            "accountName": tenant.accountName,
            "ownerName": tenant.ownerName,
            "tier": tenant.tier,
            "email": tenant.email,
            "status": "Active",
            "UserPoolId": tenant.UserPoolId,
            "IdentityPoolId": tenant.IdentityPoolId,
            "systemAdminRole": tenant.systemAdminRole,
            "systemSupportRole": tenant.systemSupportRole,
            "trustRole": tenant.trustRole,
            "systemAdminPolicy": tenant.systemAdminPolicy,
            "systemSupportPolicy": tenant.systemSupportPolicy,
            "userName": tenant.userName,
        };


        // fire request
        request({
            url: tenantURL,
            method: "POST",
            json: true,
            headers: {"content-type": "application/json"},
            body: tenantRequestData
        }, function (error, response, body) {
            if (error || (response.statusCode != 200))
                reject(error);
            else
                resolve(body);
        });
    });

    return promise;
}

/**
 * Get the health of the service
 */
app.get('/reg/health', function(req, res) {
    res.status(200).send({service: 'Tenant Registration', isAlive: true});
});


// Start the servers
//app.listen(configuration.port.reg);
//console.log(configuration.name.reg + ' service started on port ' + configuration.port.reg);
module.exports.reg = sls(app);
