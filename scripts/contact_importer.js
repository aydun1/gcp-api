const fs = require('fs');
const axios = require('axios');

const emailsFile = JSON.parse(fs.readFileSync('emails.json', 'utf8'));
//const oldJsonData = JSON.parse(convert.xml2json(oldXmlFile, {compact: true, spaces: 2}));

const baseURL = 'https://gardencityplastics.com/api/graph';
const body = {
  query: 'mutation AddSubscription($input:AddSubscriptionInput!){newsletter{addSubscription(input:$input)}}',
  variables: {input: {email:'ayduno@gmail.com'}}
};

async function sendData(email)  {
  body.variables.input['email'] = email;
  const res = await axios.post(baseURL, body);
  if (res.status !== 200) throw new Error(res.data);
  return (res.status);
}
const start = 6000;
emailsFile.emails.slice(start, start + 100).forEach(async _ => {
  console.log(_);
  return await sendData(_)
});





