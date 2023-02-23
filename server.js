// import express, { Express, Request, Response } from 'express';
import express from 'express'
import session from 'express-session'
// import {common} from "./config.js"
import common from './config.json' assert { type: "json" }
import { createAcator, openGRPCConnection, agencyv1 } from '@findy-network/findy-common-ts'
import QRCode from 'qrcode'
// import prepareIssuer from './prepare.js';

const SCHEMA_RETRY_TIMEOUT = 5000
const SCHEMA_RETRY_TIMES = 5
let retryCount = 0

const SCHEMA_NAME = 'curriculumvitae'
const DEGREE_ATTR = 'degree'
const JOB_ATTR = 'employmentperiod'
const SCHEMA_TAG = 'cv-tag'

// multiple roles playing their parts in the demo
const SCHEMA_PROVIDER = 'Schema Specification provider'
const PUBLIC_ISSUER = 'Public Service Pension Insurer'
const PRIVATE_ISSUER = 'Private Pension Insurance Company'
const UNIVERSITY = 'University for the Future studies'
const COMPANY = 'ACME Company, Ltd.'
const roles = [
  PUBLIC_ISSUER,
  PRIVATE_ISSUER,
  UNIVERSITY,
  COMPANY
]

const app = express()
app.set('trust proxy', 1)
app.use(express.static('public'))
app.use(express.json())
app.set('view engine', 'pug')
/*
app.use(session({
  secret: 'this is very secret',
  resave: false,
  saveUninitialized: false,
  cookie: {secure: true}
}));
*/

const setupFindyAgency = async (userName) => {
    const acatorProps = {
        authUrl: common.agencyProps.authUrl,
        authOrigin: common.agencyProps.authOrigin,
        userName: userName,
        key: common.agencyProps.key
    }
    const authenticator = createAcator(acatorProps)

    const grpcProps = {
        serverAddress: common.agencyProps.serverAddress,
        serverPort: common.agencyProps.serverPort,
        certPath: common.agencyProps.certPath,
        verifyServerIdentity: true,
    }
    return openGRPCConnection(grpcProps, authenticator)
}

const createCredDef = async(schemaId, agentClient) => {
  console.log(`Creating credential definition for ${schemaId}`)
  const schemaMsg = new agencyv1.Schema();
  schemaMsg.setId(schemaId)
  try {
    await agentClient.getSchema(schemaMsg)
    console.log('Got schema!')
  }
  catch(e) {
    ++retryCount
    console.warn(`Error '${e.message}' when trying to register schema '${schemaId}'. ${retryCount}/${SCHEMA_RETRY_TIMES}`)
    if (retryCount <= SCHEMA_RETRY_TIMES) {
      setTimeout(function() {createCredDef(schemaId, agentClient)}, SCHEMA_RETRY_TIMEOUT)
    }
    return
  }
  const msg = new agencyv1.CredDefCreate()
  msg.setSchemaid(schemaId)
  msg.setTag(SCHEMA_TAG)

  console.log('Running agentClient.createCredDef')
  const res = await agentClient.createCredDef(msg)
  console.log(`Cred def created ${res.getId()}`)
  return res.getId()
}

const createSchema = async(schemaName, agentClient) => {
  // console.log(`Creating schema ${schemaName}`)
  const schemaMsg = new agencyv1.SchemaCreate()
  schemaMsg.setName(schemaName)
  schemaMsg.setVersion("1.0")
  schemaMsg.setAttributesList([DEGREE_ATTR, JOB_ATTR])
  // console.log(schemaMsg)
  try {
    const schemaId = (await agentClient.createSchema(schemaMsg)).getId()
    console.log(`Created schema with schemaId ${schemaId}`)
    // the schema ID could be shared by issuers off-line
    // each issuer still needs their own credential definition?
    return schemaId
  }
  catch(e) {
    console.warn(`Error '${e.message}' when trying to create schema '${schemaName}'.`)
    return e
  }
}

const agents = {}
let schemaId
if (1) {
  let pc = await setupFindyAgency(SCHEMA_PROVIDER)
  let { createAgentClient, createProtocolClient } = pc;
  let agentClient = await createAgentClient();
  let protocolClient = await createProtocolClient();
  schemaId = await createSchema(SCHEMA_NAME, agentClient)  
}

roles.forEach(async (role) => {
  let connection = await setupFindyAgency(role)
  let { createAgentClient, createProtocolClient } = connection;
  let agentClient = await createAgentClient();
  let protocolClient = await createProtocolClient();
  agents[role] = {connection, agentClient, protocolClient}

  if ((role == PUBLIC_ISSUER) || (role == PRIVATE_ISSUER) || (role == UNIVERSITY)) {
    console.log(`Needs to create crendential definition id for schema ${schemaId} and role ${role}`)
    const id = await createCredDef(schemaId, agentClient)
    agents[role].credDefId = id
    console.log(`Created crendential definition id ${id} for role ${role}`)
  }

  await agentClient.startListeningWithHandler({
    DIDExchangeDone: async (info) => {
      let connectionId = info.connectionId
      console.log(`New connection: ${connectionId} for role ${role}`)
      if (role == PUBLIC_ISSUER) {
        const credentials = await createCredentials(JOB_ATTR, agents[PUBLIC_ISSUER].credDefId, ['Government grant application handler', 'Secretary'])
        credentials.forEach(async (credential) => {
          console.log('Issued ')
          const result = await protocolClient.sendCredentialOffer(connectionId, credential)
        })
      }
      if (role == PRIVATE_ISSUER) {
        const credentials = await createCredentials(JOB_ATTR, agents[PRIVATE_ISSUER].credDefId, ['Summer trainee', 'Customer Care Manager'])
        credentials.forEach(async (credential) => {
          const result = await protocolClient.sendCredentialOffer(connectionId, credential)
        })
      }
      if (role == UNIVERSITY) {
        const credentials = await createCredentials(DEGREE_ATTR, agents[UNIVERSITY].credDefId, ['Bachelor of Engineering', 'Master of Science'])
        credentials.forEach(async (credential) => {
          const result = await protocolClient.sendCredentialOffer(connectionId, credential)
        })
      }
      if (role == COMPANY) {
        const degAttributes = new agencyv1.Protocol.Proof()
        const degAttr = new agencyv1.Protocol.Proof.Attribute()
        degAttr.setName(DEGREE_ATTR)
        //degAttr.setCredDefid(credDefId)
        degAttributes.addAttributes(degAttr)
        const degreeRequest = new agencyv1.Protocol.PresentProofMsg()
        degreeRequest.setAttributes(degAttributes)
        await protocolClient.sendProofRequest(connectionId, degreeRequest)
      
        const jobAttributes = new agencyv1.Protocol.Proof()
        const jobAttr = new agencyv1.Protocol.Proof.Attribute()
        jobAttr.setName(JOB_ATTR)
        //jobAttr.setCredDefid(credDefId)
        jobAttributes.addAttributes(jobAttr)
        const jobRequest = new agencyv1.Protocol.PresentProofMsg()
        jobRequest.setAttributes(jobAttributes)
        await agents[COMPANY].protocolClient.sendProofRequest(connectionId, jobRequest)
      
      }
    },
    IssueCredentialDone: (info) => {
      console.log(`Credential issued: ${info.protocolId} by role ${role}`)
    },
    PresentProofPaused: async (info, presentProof) => {
      console.log(`Proof paused: ${info.protocolId} for role ${role}`)
      const protocolID = new agencyv1.ProtocolID()
      protocolID.setId(info.protocolId)
      protocolID.setTypeid(agencyv1.Protocol.Type.PRESENT_PROOF)
      protocolID.setRole(agencyv1.Protocol.Role.RESUMER)
      const msg = new agencyv1.ProtocolState()
      msg.setProtocolid(protocolID)
      msg.setState(agencyv1.ProtocolState.State.ACK)
      const attributes = presentProof.getProof()?.getAttributesList()
      console.log(attributes[0].array)
      await protocolClient.resume(msg)
    },
    PresentProofDone: (info) => {
      console.log(`Proof verified: ${info.protocolId} by role ${role}`)
    }
  },
  {
      protocolClient,
      retryOnError: true,
  })
  console.log(`Connection for role ${role} is listening.`)
})

var server = app.listen(common.port, () => {
  console.log(`Server running on port ${common.port}`)
})



/*
const createCredential = async () => {
  const attributes = new agencyv1.Protocol.IssuingAttributes()
  const deg1 = new agencyv1.Protocol.IssuingAttributes.Attribute()
  deg1.setName(DEGREE_ATTR)
  deg1.setValue("Bachelor of Engineering")
  attributes.addAttributes(deg1)
  const job1 = new agencyv1.Protocol.IssuingAttributes.Attribute()
  job1.setName(JOB_ATTR)
  job1.setValue("Trainee")
  attributes.addAttributes(job1)
  const credential = new agencyv1.Protocol.IssueCredentialMsg()
  credential.setCredDefid(credDefId)
  credential.setAttributes(attributes)
  return credential
}
*/

const createCredentials = async (credType, credDefId, names) => {
  // could join multiple items into a single credential,
  // but multiple credentials provide more flexibility to holder
  const credentials = []
  names.forEach(value => {
    const attributes = new agencyv1.Protocol.IssuingAttributes()
    const attr = new agencyv1.Protocol.IssuingAttributes.Attribute()
    attr.setName(credType)
    attr.setValue(value)
    attributes.addAttributes(attr)
    const credential = new agencyv1.Protocol.IssueCredentialMsg()
    credential.setCredDefid(credDefId)
    credential.setAttributes(attributes)
    credentials.push(credential)
  })
  return credentials
}

/*
app.get('/', async (req, res) => {
  try {
    // res.send('<h1>Here we go!</h1>')
    res.json(result)
  }
  catch(e) {
    res.json(e)
  }
})

app.get('/connect', async (req, res) => {
  const msg = new agencyv1.InvitationBase()
  msg.setLabel(common.agencyProps.userName)
  const invitation = await agentClient.createInvitation(msg)
  const invitationURL = invitation.getUrl()
  const qrcode = await QRCode.toDataURL(invitationURL)
  res.render('applicationForm', {qrcode, invitationURL})
  console.log('Finished connect rendering...')
})

app.get('/issue', async (req, res) => {
  console.log('issuing...')
  if (!connectionId) {
    // res.send('<h1>Not ready</h1><p>Please try again later')
    // return false
    console.log('Existing connection not found!')
  }
  try {
    const credential = await createCredential()
    console.log(JSON.stringify(credential, null, 1))
    console.log(`Sending offer to connection ${connectionId}`)
    const result = await protocolClient.sendCredentialOffer(connectionId, credential)
    res.json(result)
  }
  catch(e) {
    res.json(e)
  }
})
*/

const renderInvitation = async (role, res) => {
  const msg = new agencyv1.InvitationBase()
  msg.setLabel(role)
  const invitation = await agents[role].agentClient.createInvitation(msg)
  console.log(`Created invitation from ${role} with Findy Agency: ${invitation.getUrl()}`)
  const qrData = await QRCode.toDataURL(invitation.getUrl())

  res.send(`<html>
  <link rel="stylesheet" type="text/css" href="/style.css" />
  <h1>Connect with ${role}</h1>
<p>Read the QR code with the wallet application:</p>
<img src="${qrData}" title="QR code, scan using your wallet" />
<p>or copy-paste the invitation:</p>
<textarea onclick="this.focus();this.select()" readonly="readonly" rows="10" cols="60">${invitation.getUrl()}</textarea>
</html>`);

  return JSON.parse(invitation.getJson())["@id"]
}

app.get('/publicservicepositions', async (req, res) => {
  console.log('issuing public service position credentials...')
  renderInvitation(PUBLIC_ISSUER, res)
})

app.get('/privateemploymentperiods', async (req, res) => {
  console.log('issuing private job credentials...')
  renderInvitation(PRIVATE_ISSUER, res)
})

app.get('/universitydegrees', async (req, res) => {
  console.log('issuing university degree credentials...')
  renderInvitation(UNIVERSITY, res)
})

app.get('/apply', async (req, res) => {
  console.log('displaying application form...')
  const msg = new agencyv1.InvitationBase()
  msg.setLabel(COMPANY)
  const invitation = await agents[COMPANY].agentClient.createInvitation(msg)
  const invitationURL = invitation.getUrl()
  const qrcode = await QRCode.toDataURL(invitationURL)
  res.render('applicationForm', {qrcode, invitationURL})

})
