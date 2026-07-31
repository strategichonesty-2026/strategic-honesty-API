const { gql } = require('./client');

const GET_ORGANIZATIONS = gql`
  query GetOrganizations {
    account {
      organizations {
        id
      }
    }
  }
`;

const GET_CHANNELS = gql`
  query GetChannels($organizationId: String!) {
    channels(input: { organizationId: $organizationId }) {
      id
      name
      service
    }
  }
`;

const CREATE_POST = gql`
  mutation CreatePost($input: CreatePostInput!) {
    createPost(input: $input) {
      ... on PostActionSuccess {
        post {
          id
          text
          dueAt
        }
      }
      ... on MutationError {
        message
      }
    }
  }
`;

module.exports = { GET_ORGANIZATIONS, GET_CHANNELS, CREATE_POST };
