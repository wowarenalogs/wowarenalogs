import NA_TWW_S1C1 from '../../data/awc/NA_TWW_S1C1.json';

export const AWCPage = () => {
  const allMatches = [
    ...Object.values(NA_TWW_S1C1.segments.upper.rounds).flat(),
    ...Object.values(NA_TWW_S1C1.segments.lower.rounds).flat(),
  ];

  return (
    <div>
      <h1 style={{ textAlign: 'center' }}>AWC: The War Within Season 1 Cup 1</h1>
      <div style={{ overflowX: 'auto', maxHeight: '600px' }}>
        <table>
          <caption>Match Results</caption>
          <thead>
            <tr>
              <th>Date</th>
              <th>Bracket</th>
              <th>Round</th>
              <th>Team 1</th>
              <th>Team 2</th>
              <th>Winner</th>
              <th>Game</th>
              <th>Dungeon</th>
            </tr>
          </thead>
          <tbody>
            {allMatches.flatMap((match) => {
              const team1 = match.firstTeam;
              const team2 = match.secondTeam;
              const matchDate = new Date(match.updatedAt).toLocaleDateString();

              return match.games.map((game, index) => {
                const winnerTeam = game.winnerTeamId === team1.id ? team1 : team2;
                return (
                  <tr key={`${match.id}-${game.id}`}>
                    <td>{matchDate}</td>
                    <td>{match.position}</td>
                    <td>{match.round}</td>
                    <td>
                      <a href={team1.teamEventProfileUrl} target="_blank" rel="noopener noreferrer">
                        {team1.name}
                      </a>
                    </td>
                    <td>
                      <a href={team2.teamEventProfileUrl} target="_blank" rel="noopener noreferrer">
                        {team2.name}
                      </a>
                    </td>
                    <td>{winnerTeam.name}</td>
                    <td>{index + 1}</td>
                    <td>{game.dungeon?.name || 'N/A'}</td>
                  </tr>
                );
              });
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={8}>Total Games: {allMatches.reduce((sum, match) => sum + match.games.length, 0)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};
