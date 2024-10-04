import NA_TWW_S1C1 from '../../data/awc/NA_TWW_S1C1.json';

export const AWCPage = () => {
  const allMatches = [
    ...Object.values(NA_TWW_S1C1.segments.upper.rounds).flat(),
    ...Object.values(NA_TWW_S1C1.segments.lower.rounds).flat(),
  ];

  const sortedMatches = allMatches.sort((a, b) => {
    if (a.position === b.position) {
      return b.round - a.round;
    }
    return a.position === 'upper' ? -1 : 1;
  });

  return (
    <div>
      <h1>AWC Matches</h1>
      <table>
        <thead>
          <tr>
            <th>Bracket</th>
            <th>Round</th>
            <th>Winner</th>
            <th>Map</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          {sortedMatches.map((match) => {
            const winnerTeam = match.firstTeamStatus === 'active' ? match.firstTeam : match.secondTeam;
            const lastGame = match.games[match.games.length - 1];
            const mapName = lastGame.dungeon ? lastGame.dungeon.name : 'N/A';
            const matchTime = new Date(match.updatedAt).toLocaleString();

            return (
              <tr key={match.id}>
                <td>{match.position}</td>
                <td>{match.round}</td>
                <td>{winnerTeam.name}</td>
                <td>{mapName}</td>
                <td>{matchTime}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
