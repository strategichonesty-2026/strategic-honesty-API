const { GraphQLClient, gql } = require('graphql-request');

const BUFFER_ENDPOINT = 'https://api.buffer.com';

function createBufferClient() {
  const apiKey = process.env.BUFFER_API_KEY;
  if (!apiKey) throw new Error('BUFFER_API_KEY is not set');
  return new GraphQLClient(BUFFER_ENDPOINT, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
}

module.exports = { createBufferClient, gql };
