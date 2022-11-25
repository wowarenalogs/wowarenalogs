import { ApolloError } from '@apollo/client';

export function QuerryError({ query }: { query: { error?: ApolloError } }) {
  if (process.env.NODE_ENV !== 'development') {
    if (query.error) {
      return (
        <div className="flex pt-4">
          <div className="card w-full bg-error text-error-content animate-fadein">
            <div className="card-body break-words">An error has occurred</div>
          </div>
        </div>
      );
    } else {
      return null;
    }
  }
  return (
    <div className="flex pt-4">
      {query.error?.graphQLErrors.map((e) => (
        <div className="card w-full bg-error text-error-content animate-fadein" key={e.message}>
          <div className="card-body break-words">{e.message}</div>
        </div>
      ))}
      {query.error?.clientErrors.map((e) => (
        <div className="card w-full bg-error text-error-content" key={e.message}>
          <div className="card-body break-words">{e.message}</div>
        </div>
      ))}
    </div>
  );
}
