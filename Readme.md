#Each Function has a respective serverless yml in the config folder.
To deploy one function at a time run the command `sls deploy --config-file <path/to/yml>`

#For Example to deploy auth manager

`sls deploy --config-file ./config/auth-manager.yml`