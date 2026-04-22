import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Users, 
  MoreVertical, 
  Mail, 
  GraduationCap, 
  Shield, 
  Ban,
  Filter
} from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { 
  getAllUsers, 
  type UserProfile 
} from '../../utils/firebase/firestore';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '../ui/dropdown-menu';

export function UserManagement() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const unsubscribe = getAllUsers((data) => {
      setUsers(data);
      setLoading(false);
    });
    return () => unsubscribe && unsubscribe();
  }, []);

  const filteredUsers = users.filter(u => 
    (u.displayName || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
    (u.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.major || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <Input 
            className="pl-10 bg-white border-slate-200 rounded-xl w-full" 
            placeholder="Search users..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Button variant="outline" className="rounded-xl gap-2 border-slate-200">
          <Filter size={18} />
          Filter
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredUsers.map((user) => (
          <Card key={user.uid} className="border-none shadow-sm rounded-2xl overflow-hidden hover:shadow-md transition-shadow">
            <CardContent className="p-0">
              <div className="flex flex-col sm:flex-row sm:items-center p-4 gap-4 sm:gap-6">
                <div className="flex items-center gap-4 flex-1">
                  <Avatar className="w-12 h-12 border-2 border-white shadow-sm">
                    <AvatarImage src={user.photoURL || undefined} />
                    <AvatarFallback className="bg-sky-100 text-sky-700 font-bold">
                      {(user.displayName || 'U').charAt(0)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="text-base font-bold text-slate-900 truncate">{user.displayName}</h3>
                      {user.isAdmin && (
                        <Badge className="bg-amber-100 text-amber-700 border-none text-[10px] px-1.5 py-0">
                          <Shield size={10} className="mr-1" /> Admin
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 text-xs text-slate-500">
                      <span className="flex items-center gap-1"><Mail size={12} /> {user.email}</span>
                      <span className="flex items-center gap-1"><GraduationCap size={12} /> {user.major || 'No Major'} • {user.year || 'No Year'}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4 pt-3 sm:pt-0 border-t sm:border-t-0 sm:border-l border-slate-100 sm:pl-6">
                  <div className="text-right">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Status</p>
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${user.online ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                      <p className="text-xs font-bold text-slate-700">{user.online ? 'Online' : 'Offline'}</p>
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="rounded-full h-8 w-8">
                        <MoreVertical size={18} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48 rounded-xl border-slate-100 shadow-xl">
                      <DropdownMenuItem>
                        <Shield size={16} className="mr-2" /> {user.isAdmin ? 'Revoke Admin' : 'Make Admin'}
                      </DropdownMenuItem>
                      <div className="h-px bg-slate-100 my-1" />
                      <DropdownMenuItem className="text-rose-600">
                        <Ban size={16} className="mr-2" /> Suspend User
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {filteredUsers.length === 0 && !loading && (
          <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-200">
            <Users size={48} className="mx-auto text-slate-200 mb-4" />
            <h3 className="text-lg font-medium text-slate-900">No users found</h3>
            <p className="text-slate-500">Try adjusting your search criteria</p>
          </div>
        )}
      </div>
    </div>
  );
}
