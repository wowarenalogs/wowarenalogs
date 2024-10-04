import NA_TWW_S1C1 from '../../data/awc/NA_TWW_S1C1.json';

export const AWCPage = () => {
  const allGames = [
    ...Object.values(NA_TWW_S1C1.segments.upper.rounds).flat(),
    ...Object.values(NA_TWW_S1C1.segments.lower.rounds).flat(),
  ].flatMap(match => match.games.map(game => ({ ...game, match })))
   .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

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
            {allGames.map((game, index) => {
              const match = game.match;
              const team1 = match.firstTeam;
              const team2 = match.secondTeam;
              const winnerTeam = game.winnerTeamId === team1.id ? team1 : team2;
              const loserTeam = game.winnerTeamId === team1.id ? team2 : team1;
              const gameDate = new Date(game.updatedAt).toLocaleString();
              return (
                <tr key={`${match.id}-${game.id}`}>
                  <td>{gameDate}</td>
                  <td>{match.position}</td>
                  <td>{match.round}</td>
                  <td>{winnerTeam.name}</td>
                  <td>{loserTeam.name}</td>
                  <td>{match.games.findIndex(g => g.id === game.id) + 1}</td>
                  <td>{game.dungeon?.name || 'N/A'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
