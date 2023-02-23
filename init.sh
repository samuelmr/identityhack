export PATH="./node_modules/.bin:$PATH"

# alias cli=findy-common-ts
alias cli=findy-agent-cli

# hackathon env
export FCLI_TLS_PATH="$PWD/cert"
export FCLI_URL='https://agency.digitalidentityhack.com'
export FCLI_ORIGIN='https://agency.digitalidentityhack.com'
export AGENCY_API_SERVER='agency-api.digitalidentityhack.com'
export AGENCY_API_SERVER_PORT='50051'
export FCLI_SERVER="$AGENCY_API_SERVER:$AGENCY_API_SERVER_PORT"

# your unique user name for issuer
now=`date +%s`
// export FCLI_USER="hack-user-$now"
export FCLI_USER="issue-test-user-123"
# generate a new key
export FCLI_KEY=`cli new-key`
# register the new user
echo "Registering new user $FCLI_USER"
cli authn register
export FCLI_JWT=`cli authn login`

echo "Downloading server certificate of '$FCLI_SERVER' to '$FCLI_TLS_PATH'"
echo -n | openssl s_client -connect $FCLI_SERVER -servername $FCLI_SERVER |
     openssl x509 > $FCLI_TLS_PATH/server/server.crt

cat > config.json <<- EOM
{
    "port": 4558,
    "agencyProps": {
      "authUrl": "$FCLI_URL",
      "authOrigin": "$FCLI_ORIGIN",
      "userName": "$FCLI_USER",
      "key": "$FCLI_KEY",
      "serverAddress": "$AGENCY_API_SERVER",
      "serverPort": $AGENCY_API_SERVER_PORT,
      "certPath": ""
    }
}

EOM


