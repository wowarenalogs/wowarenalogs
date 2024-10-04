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
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {allMatches.map((match) => {
              const team1 = match.firstTeam;
              const team2 = match.secondTeam;
              const winnerTeam = match.winnerTeamId === team1.id ? team1 : team2;
              const team1Wins = match.games.filter((game) => game.winnerTeamId === team1.id).length;
              const team2Wins = match.games.filter((game) => game.winnerTeamId === team2.id).length;
              const matchDate = new Date(match.updatedAt).toLocaleDateString();

              return (
                <tr key={match.id}>
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
                  <td>
                    {team1Wins} - {team2Wins}
                  </td>
                  <td>
                    {match.games.map((d) => (
                      <div key={d.id}>
                        {d.id} {d.dungeon?.name}
                      </div>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={7}>Total Matches: {allMatches.length}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};
