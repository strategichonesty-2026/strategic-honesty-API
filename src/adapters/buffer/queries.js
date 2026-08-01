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
  query GetChannels($organizationId: OrganizationId!) {
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

const GET_POST = gql`
  query GetPost($id: PostId!) {
    post(input: { id: $id }) {
      ... on Post {
        id
        status
        sentAt
        externalLink
        error {
          message
        }
      }
    }
  }
`;

module.exports = { GET_ORGANIZATIONS, GET_CHANNELS, CREATE_POST, GET_POST };
