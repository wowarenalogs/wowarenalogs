import { ICombatData } from '@wowarenalogs/parser';

interface IProps {
  id: string;
  combat: ICombatData;
  anon?: boolean;
  search?: string;
}

export const CombatReport = ({ id }: IProps) => {
  return (
    <div className="w-full h-full flex flex-col p-2">
      <div>{id}</div>
    </div>
  );
};
