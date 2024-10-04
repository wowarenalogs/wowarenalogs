import NA_TWW_S1C1 from '../../data/awc/NA_TWW_S1C1.json';

export const AWCPage = () => {
  const allMatches = [
    ...Object.values(NA_TWW_S1C1.segments.upper.rounds).flat(),
    ...Object.values(NA_TWW_S1C1.segments.lower.rounds).flat(),
  ].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

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
              <th>Winner</th>
              <th>Loser</th>
              <th>Game</th>
              <th>Dungeon</th>
            </tr>
          </thead>
          <tbody>
            {allMatches.flatMap((match) => {
              const team1 = match.firstTeam;
              const team2 = match.secondTeam;
              const matchDate = new Date(match.updatedAt).toLocaleString();

              return match.games.map((game, index) => {
                const winnerTeam = game.winnerTeamId === team1.id ? team1 : team2;
                const loserTeam = game.winnerTeamId === team1.id ? team2 : team1;
                return (
                  <tr key={`${match.id}-${game.id}`}>
                    <td>{matchDate}</td>
                    <td>{match.position}</td>
                    <td>{match.round}</td>
                    <td>{winnerTeam.name}</td>
                    <td>{loserTeam.name}</td>
                    <td>{index + 1}</td>
                    <td>{game.dungeon?.name || 'N/A'}</td>
                  </tr>
                );
              });
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
