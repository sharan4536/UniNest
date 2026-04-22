import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Badge } from './ui/badge';

const developers = [
  {
    name: 'Sharan Reddy',
    role: 'Lead Developer',
    bio: 'Full-stack developer passionate about connecting students through technology.',
    skills: ['React', 'Node.js', 'Python', 'UI/UX'],
    github: 'Pavan',
    linkedin: 'Pavan'
  },
  {
    name: 'Abhinav M',
    role: 'UI/UX Developer',
    bio: 'Systems architect ensuring scalable and secure backend infrastructure.',
    skills: ['Node.js', 'FireBase'],
    github: 'abhinav',
    linkedin: 'abhinav'
  },
  {
    name: 'Sharan',
    role: 'Product Designer',
    bio: 'UX researcher and designer creating meaningful connections through design.',
    skills: ['Figma', 'User Research', 'Prototyping', 'Design Thinking'],
    github: 'Sharan',
    linkedin: 'sharangoshreddy'
  }
];

export function AboutPage() {
  return (
    <div className="max-w-6xl mx-auto p-4 space-y-8">
      <div className="text-center mb-8">
        <div className="mx-auto w-20 h-20 rounded-full flex items-center justify-center mb-4 bg-primary/20 shadow-lg shadow-primary/20">
          {(() => {
            const [logoFailed] = [false];
            return (
              <LogoImage />
            );
          })()}
        </div>
        <h1 className="text-4xl mb-4">About UniNest</h1>
        <p className="text-lg opacity-75 max-w-2xl mx-auto">
          Connecting university students through location sharing, messaging, and collaborative study tools
        </p>
      </div>

      {/* Mission Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-center text-2xl">Our Mission</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-lg">
            UniNest was created to help university students build meaningful connections and find study partners on campus.
            We believe that education is better when it's collaborative and social.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
            <div className="text-center p-6 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors">
              <div className="text-3xl mb-3">🤝</div>
              <h3 className="text-lg mb-2 font-semibold">Connect</h3>
              <p className="text-sm text-muted-foreground">Find and connect with fellow students in your courses and campus</p>
            </div>
            <div className="text-center p-6 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors">
              <div className="text-3xl mb-3">📍</div>
              <h3 className="text-lg mb-2 font-semibold">Locate</h3>
              <p className="text-sm text-muted-foreground">Share your location and find study buddies near you on campus</p>
            </div>
            <div className="text-center p-6 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors">
              <div className="text-3xl mb-3">📚</div>
              <h3 className="text-lg mb-2 font-semibold">Collaborate</h3>
              <p className="text-sm text-muted-foreground">Share timetables, organize study groups, and message directly</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Features Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-center text-2xl">Key Features</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center bg-primary/20 text-primary">
                  <span>🗺️</span>
                </div>
                <div>
                  <h4 className="font-medium">Campus Map Integration</h4>
                  <p className="text-sm text-muted-foreground">See where your friends are studying in real-time</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center bg-primary/20 text-primary">
                  <span>💬</span>
                </div>
                <div>
                  <h4 className="font-medium">Direct Messaging</h4>
                  <p className="text-sm text-muted-foreground">Chat with friends and study partners instantly</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center bg-primary/20 text-primary">
                  <span>📅</span>
                </div>
                <div>
                  <h4 className="font-medium">Timetable Sharing</h4>
                  <p className="text-sm text-muted-foreground">Share and compare class schedules with friends</p>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center bg-primary/20 text-primary">
                  <span>🔍</span>
                </div>
                <div>
                  <h4 className="font-medium">Friend Discovery</h4>
                  <p className="text-sm text-muted-foreground">Find students in your courses and departments</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center bg-primary/20 text-primary">
                  <span>🔒</span>
                </div>
                <div>
                  <h4 className="font-medium">Privacy Controls</h4>
                  <p className="text-sm text-muted-foreground">Control who can see your location and information</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center bg-primary/20 text-primary">
                  <span>🎓</span>
                </div>
                <div>
                  <h4 className="font-medium">University Verified</h4>
                  <p className="text-sm text-muted-foreground">Secure platform verified through university email</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Development Team */}
      <Card>
        <CardHeader>
          <CardTitle className="text-center text-2xl">Meet the Team</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 justify-items-center">
              {developers.map((dev, index) => (
                <div key={index} className="text-center space-y-3">
                  <Avatar className="w-20 h-20 mx-auto">
                    <AvatarFallback className="text-xl">{dev.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                  </Avatar>
                  <h3 className="font-medium">{dev.name}</h3>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contact Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-center text-2xl">Get in Touch</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p>Have questions, feedback, or want to contribute? We'd love to hear from you!</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <div className="flex items-center gap-2">
              <span>📧</span>
              <span>contact@uninest.app</span>
            </div>
            <div className="flex items-center gap-2">
              <span>🐦</span>
              <span>@UniNestApp</span>
            </div>
            <div className="flex items-center gap-2">
              <span>🌐</span>
              <span>github.com/uninest</span>
            </div>
          </div>
          <div className="mt-6 p-4 rounded-lg bg-secondary/10 border border-secondary/20">
            <p className="text-sm text-secondary-foreground"><strong>Version 1.0.0</strong></p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function LogoImage() {
  const [error, setError] = useState(false);
  if (error) {
    return <span className="text-4xl">🏫</span>;
  }
  return (
    <img
      src="/uninest-logo.png"
      alt="UniNest Logo"
      className="w-16 h-16 object-contain"
      onError={() => setError(true)}
    />
  );
}
